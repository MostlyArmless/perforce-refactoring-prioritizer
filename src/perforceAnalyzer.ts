import * as fse from 'fs-extra';
import { spawn, ChildProcess } from 'child_process';
import { sanitizeDateString, sanitizeDate } from './helperFunctions';

export class RefactoringPrioritizer {
    private defectsPerFile: Map<string, number>;
    private startDate: string;
    private numChangelistsProcessed: number;
    private numDefectsProcessed: number;
    private isFirstP4ChangeChunk: boolean;
    private p4ChangesLastLine: string;
    private isFirstP4FilesChunk: boolean;
    private p4FilesLastLine: string;

    constructor(startDate: string) {
        this.defectsPerFile = new Map<string, number>();
        this.startDate = startDate;
        this.numChangelistsProcessed = 0;
        this.numDefectsProcessed = 0;
        this.isFirstP4ChangeChunk = true;
        this.p4ChangesLastLine = "";
        this.p4FilesLastLine = "";
    }

    private onP4Changes(p4ProcChanges: ChildProcess): Promise<Promise<any>[]> {
        return new Promise((resolve, reject) => {
            p4ProcChanges.stdout.on('data', async data => {
                const lines = data.toString().split('\n');
                let line = "";
                let promises: Promise<any>[] = [];
                for (let i = 0; i < lines.length; i++) {
                    line = lines[i];
                    if (i === 0 && !this.isFirstP4ChangeChunk) {
                        // This is the first line of a new chunk, we need to concatenate this first line with the partial line from the last chunk
                        line = this.p4ChangesLastLine + line;
                    }
                    
                    this.numChangelistsProcessed++;
                    if (this.isChangelistADefectFix(line)) {
                        const clNumber = this.getChangelistNumber(line);
                        promises.push(this.updateFileDefectMap(clNumber));
                    }
                }
                
                // Save the last partial line of this chunk to be concatenated with the first partial line of the next chunk
                this.p4ChangesLastLine = line;
                this.isFirstP4ChangeChunk = false;
                console.log(`Done p4Changes`);
                resolve(promises);
            });
        });
    }

    private onP4Files(p4ProcFiles: ChildProcess): Promise<void> {
        return new Promise((resolve, reject) => {
            p4ProcFiles.stdout.on('data', data => {
                const lines = data.toString().split('\n');
                
                let line = "";
                for (let i = 0; i < lines.length; i++) {
                    line = lines[i];
                    if (line === "") {
                        break;
                    }

                    if (i === 0 && !this.isFirstP4FilesChunk) {
                        // This is the first line of a new chunk, we need to concatenate this first line with the partial line from the last chunk
                        line = this.p4FilesLastLine + line;
                    }

                    this.numDefectsProcessed++;

                    const matchResult = line.match(/([^#]+)#\d+ - /);
                    if (!matchResult) {
                        // This just means we reached the end of the chunk and found an incomplete line
                        continue;
                    }
                    const fileName = matchResult[1];
                    const defectsOnThisFile = this.defectsPerFile.get(fileName);
                    if (defectsOnThisFile) {
                        this.defectsPerFile.set(fileName, defectsOnThisFile + 1);
                    }
                    else {
                        this.defectsPerFile.set(fileName, 1);
                    }
                }
                
                this.p4FilesLastLine = line;
                this.isFirstP4FilesChunk = false;
                console.log(`Done p4Files`);
                resolve();
            });
        });
    }

    private onChildProcExit(childProc: ChildProcess) {
        return new Promise((resolve, reject) => {
            childProc.on('exit', (code, signal) => {
                if (code === 0) {
                    resolve();
                }
                else {
                    console.warn(`NON-ZERO exit code for process PID ${childProc.pid}`);
                    reject();
                }
            });
        });
    }

    private getChangelistNumber(line: string): number {
        const matchResult = line.match(/Change (\d+) on/);
        if (!matchResult) {
            throw new Error(`line didn't contain a changelist number:\n${line}`);
            return null;
        }
        const clNum = parseInt(matchResult[1]);
        return clNum;
    }

    private async updateFileDefectMap(clNumber: number): Promise<any> {
        console.log(`Spawning p4 files process...`);
        let p4ProcFiles = spawn('p4.exe', ['files', `@=${clNumber}`]);
        let promises: Promise<any>[] = [];
        promises.push(this.onP4Files(p4ProcFiles));
        promises.push(this.onChildProcExit(p4ProcFiles));
        return promises;
    }

    private isChangelistADefectFix(line: string): boolean {
        return line.match(/DE\s?\d{3,8}/i) !== null;
    }

    async prioritizeRefactoring() {
        console.log(`Analyzing all changelists between ${this.startDate} and now...`);
        const startTime = process.hrtime.bigint();
        let p4ProcChanges = spawn('p4.exe', ['changes', '-s', 'submitted', `@${this.startDate},@now`]);

        let promises: Promise<any>[] = [];
        promises.push(this.onP4Changes(p4ProcChanges));
        promises.push(this.onChildProcExit(p4ProcChanges));

        await Promise.all(promises);

        const msPerNs = BigInt(1e6);
        const endTime = process.hrtime.bigint();
        const durationMs = (endTime - startTime) / msPerNs;
        const averageRate = durationMs / BigInt(this.numChangelistsProcessed);
        const defectRate = durationMs / BigInt(this.numDefectsProcessed);
        console.log(`Total runtime = ${durationMs} ms`);
        console.log(`Processed at ${averageRate} ms/changelist`);
        console.log(`Processed at ${defectRate} ms/defect`);
        this.logResultsToFile();
        const logTime = process.hrtime.bigint();
        const logDuration = (logTime - endTime) / msPerNs;
        console.log(`Spent an additional ${logDuration} ms logging the results.`);
        console.log(`DONE`);
    }

    private logResultsToFile() {
        console.log(`Processed ${this.numChangelistsProcessed} changelists and found ${this.numDefectsProcessed} that addressed defects.`);
        console.log(`logging results to file...`);
        // Now print the modified files from most-modified to least-modified, only showing files that have been modified 2 or more times
        let arr = [...this.defectsPerFile];
        arr.sort((first, second) => {
            return second[1] - first[1];
        });
        const logfile = `./results/prioritizeRefactoring_from_${sanitizeDateString(this.startDate)}_to_${sanitizeDate(new Date())}.csv`;
        fse.createFileSync(logfile);
        fse.writeFileSync(logfile, `Filename, Number of changes due to defect fixes between ${sanitizeDateString(this.startDate)} and ${sanitizeDate(new Date())}\n`);

        for (let i = 0; i < arr.length; i++) {
            const dictEntry = arr[i];
            if (dictEntry[1] < 2) {
                break;
            }
            const logString = `"${dictEntry[0]}",${dictEntry[1]}`;
            fse.appendFileSync(logfile, logString + '\n');
        }
    }
}
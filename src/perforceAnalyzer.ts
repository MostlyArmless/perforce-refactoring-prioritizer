import * as fse from 'fs-extra';
import { spawn, ChildProcess } from 'child_process';
import { sanitizeDateString, sanitizeDate } from './helperFunctions';

export class RefactoringPrioritizer {
    private defectsPerFile: Map<string, number>;
    private startDate: string;
    private numChangelistsProcessed: number;
    private numDefectsProcessed: number;

    constructor(startDate: string) {
        this.defectsPerFile = new Map<string, number>();
        this.startDate = startDate;
        this.numChangelistsProcessed = 0;
        this.numDefectsProcessed = 0;
    }

    private onP4Changes(p4ProcChanges: ChildProcess): Promise<any> {
        return new Promise((resolve, reject) => {
            p4ProcChanges.stdout.on('data', async data => {
                const lines = data.toString().split('\n');
                let promises: Promise<any>[] = [];
                lines.forEach(line => {
                    this.numChangelistsProcessed++;                    
                    if (this.isChangelistADefectFix(line)) {
                        const clNumber = this.getChangelistNumber(line);
                        promises.push(this.updateFileDefectMap(clNumber));
                    }
                });

                resolve(Promise.all(promises));
            });
        });
    }

    private onP4Files(p4ProcFiles: ChildProcess): Promise<void> {
        return new Promise((resolve, reject) => {
            p4ProcFiles.stdout.on('data', data => {
                const lines = data.toString().split('\n');
                lines.forEach(line => {
                    if (line === "") {
                        return;
                    }
                    this.numDefectsProcessed++;

                    const matchResult = line.match(/([^#]+)#\d+ - /);
                    const fileName = matchResult[1];
                    const defectsOnThisFile = this.defectsPerFile.get(fileName);
                    if (defectsOnThisFile) {
                        this.defectsPerFile.set(fileName, defectsOnThisFile + 1);
                    }
                    else {
                        this.defectsPerFile.set(fileName, 1);
                    }
                });
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

    private async updateFileDefectMap(clNumber: number): Promise<void> {
        let p4ProcFiles = spawn('p4.exe', ['files', `@=${clNumber}`]);
        return this.onP4Files(p4ProcFiles);
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
        const endTime = process.hrtime.bigint();
        const durationMs = (endTime - startTime) / BigInt(1e6);
        const rate = durationMs / BigInt(this.numChangelistsProcessed);
        console.log(`Total runtime = ${durationMs} ms, or about ${rate} ms/changelist`);
        this.logResultsToFile();
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
            console.log(logString);
            fse.appendFileSync(logfile, logString + '\n');
        }
    }
}
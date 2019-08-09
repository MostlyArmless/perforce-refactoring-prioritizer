import * as fse from 'fs-extra';
import { spawn } from 'child_process';

export class RefactoringPrioritizer {
    private defectsPerFile: Map<string, number>;
    startDate: string;
    p4ChangesCompleted: boolean;
    p4FilesCompleted: boolean;

    constructor(startDate: string) {
        this.defectsPerFile = new Map<string, number>();
        this.startDate = startDate;
    }

    getStartDate(): string {
        // Return a date string 1 year ago, in the format 2018/12/24
        const now = new Date;
        // const lastYear = now.getFullYear() - 1;
        const lastMonth = now.getMonth(); // This one is zero-based for some stupid reason.
        return `${now.getFullYear()}/${lastMonth}/${now.getDate()}`;
    }

    private getChangelistNumber(line: string): number {
        const matchResult = line.match(/Change (\d+) on/);
        const clNum = parseInt(matchResult[1]);
        return clNum;
    }

    private updateFileDefectMap(clNumber: number): void {
        this.p4FilesCompleted = false;
        let p4ProcFiles = spawn('p4.exe', ['files', `@=${clNumber}`]);
        p4ProcFiles.on('exit', (code, signal) => {
            console.log(`'p4 files' exited with code ${code} and signal ${signal}`);
            this.p4FilesCompleted = true;
        });

        p4ProcFiles.stdout.on('data', data => {
            const lines = data.toString().split('\n');
            lines.forEach(line => {
                if (line === "") {
                    return;
                }

                const matchResult = line.match(/([^#]+)#\d+ - /);
                const fileName = matchResult[1];
                const defectsOnThisFile = this.defectsPerFile.get(fileName);
                if (defectsOnThisFile) {
                    this.defectsPerFile.set(fileName, defectsOnThisFile+1);
                }
                else {
                    this.defectsPerFile.set(fileName, 1);
                }
            });
        });
    }

    isChangelistADefectFix(line: string): boolean {
        return line.match(/DE\s?\d{3,8}/i) !== null;
    }

    sanitizeDateString(date: string): string {
        return date.replace(/\//g, '-');
    }

    sanitizeDate(date: Date): string {
        return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
    }

    async prioritizeRefactoring() {
        console.log(`Analyzing all changelists between ${this.startDate} and now...`);
        this.p4ChangesCompleted = false;
        let p4ProcChanges = spawn('p4.exe', ['changes', '-s', 'submitted', `@${this.startDate},@now`]);

        let lineNum = 0;

        p4ProcChanges.stdout.on('data', async data => {
            const lines = data.toString().split('\n');
            lines.forEach(async line => {
                lineNum++;
                console.log(`${lineNum} - ${line}`);

                if (this.isChangelistADefectFix(line)) {
                    const clNumber = this.getChangelistNumber(line);
                    this.updateFileDefectMap(clNumber);
                }
            });
        });

        p4ProcChanges.on('exit', (code, signal) => {
            this.p4ChangesCompleted = true;
            console.log(`'p4 changes' exited with code ${code} and signal ${signal}`);
        });
    }

    logResultsToFile() {
        // Now print the modified files from most-modified to least-modified, only showing files that have been modified 2 or more times
        let arr = [...this.defectsPerFile];
        arr.sort((first, second) => {
            return second[1] - first[1];
        });
        const logfile = `./results/prioritizeRefactoring_from_${this.sanitizeDateString(this.startDate)}_to_${this.sanitizeDate(new Date())}.csv`;
        fse.createFileSync(logfile);
        fse.writeFileSync(logfile, `Filename, Number of changes due to defect fixes between ${this.sanitizeDateString(this.startDate)} and ${this.sanitizeDate(new Date())}`);

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
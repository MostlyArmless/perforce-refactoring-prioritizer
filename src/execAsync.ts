import { exec } from 'child_process';

export function execAsync(cmd): Promise<string> {
    return new Promise((resolve, reject) => {
        exec(cmd, (err, stdout, stderr) => {
            if (err) {
                console.warn(err);
            }
            resolve(stdout ? stdout : stderr);
        });
    })
}
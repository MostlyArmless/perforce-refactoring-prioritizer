#!/usr/bin/env node
/*
This tool goes through all the perforce submits, isolates the ones that were defect fixes, and counts how many times a given file was touched as a result of fixing a defect

Then it plots Defects per File so we can consider which parts of the codebase need more attention.

Test it by running:
npm start -- 2019/08/05
(currently can only handle date ranges around a year or less due to buffer overflow of stdout coming back from the p4 changes command)
*/

import { RefactoringPrioritizer } from './perforceAnalyzer';
import { validateStartDate } from './validators';

async function main() {
    const startDate = process.argv[2];
    if (!validateStartDate(startDate)) {
        console.error(`Invalid start date "${startDate}". Aborting.`);
        process.exit();
    }
    console.log(`startDate = ${startDate}`);
    const prioritizer = new RefactoringPrioritizer(startDate);
    prioritizer.prioritizeRefactoring();
}

main();
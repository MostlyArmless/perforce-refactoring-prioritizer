# perforce-refactoring-prioritizer

If you're working in a large codebase and you're not sure where to focus your refactoring efforts, this tool can help you by highlighting which files are most frequently implicated when defects arise.

This is a CLI tool that accepts a start date in the form 'YYYY/MM/DD'. Given that starting date, the tool will look through all submitted changelists from then until now, and isolate any that mention a Rally defect number. For each of those changelists, it checks which files were touched as part of fixing that defect. The end product is a CSV file sorted from most-touched to least-touched files, indicating how many changelists touched each file. (only includes files that were touched 2 or more times).

## Installation

`npm i -g perforce-refactor-prioritizer`

## Usage

From the source directory:
`npm start -- 2019/08/08`

From the cmd line after installation:
`perforce-refactor-prioritizer 2019/08/08`

Then wait for it to finish and check out the CSV file in `./results/`

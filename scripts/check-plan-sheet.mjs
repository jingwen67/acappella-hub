import assert from 'node:assert/strict';
import {createGoogle,mergeSemesters} from '../worker/google.js';
assert.equal(mergeSemesters('2025 Fall, 2026fall','2026 Fall','2027 Spring'),'2025 Fall, 2026fall, 2027 Spring');
const cells=[['曲名Song Title','编曲Arranger','学期Semester','性质Type','链接Link'],['Song A','Original arranger','2025 Fall','all','=HYPERLINK("https://drive.google.com/drive/folders/folderA","Song A")'],['Song B','Other arranger','2026 Fall','group','https://drive.google.com/drive/folders/folderB'],['Unlinked','Someone','2025 Fall','all',''],['Different folder','Someone','2025 Fall','all','https://drive.google.com/drive/folders/oldDifferent'],['Ambiguous','A','2025 Fall','all',''],['Ambiguous','B','2024 Fall','all',''],['Job collision','Someone','2025 Fall','all',''],['林俊杰组曲2.0','Charlie','2025 Fall','all','林俊杰组曲2.0'],['=HYPERLINK("https://example.com","Formula title")','Someone','2025 Fall','all','']];
const original=structuredClone(cells),writes=[],previousFetch=globalThis.fetch;
const storage={get:async()=>({json:async()=>({clientId:'test-client',clientSecret:'test-secret',spreadsheetId:'test-sheet',refreshToken:'test',accessToken:'test',expiresAt:Date.now()+3600000})}),put:async()=>{}};
globalThis.fetch=async(url,options={})=>{
 const parsed=new URL(url);let value;
 if(parsed.pathname.endsWith('/values:batchUpdate')){const body=JSON.parse(options.body);assert.equal(body.valueInputOption,'RAW');writes.push(body);for(const item of body.data){assert.match(item.range,/!C\d+$/);const row=Number(item.range.match(/C(\d+)$/)[1])-1;cells[row][2]=item.values[0][0];}value={totalUpdatedCells:body.data.length};}
 else if(parsed.pathname.includes('/values/'))value={values:cells};
 else if(parsed.searchParams.has('ranges'))value={sheets:[{data:[{startRow:0,rowData:cells.map((row,i)=>({values:row.map((text,j)=>({formattedValue:i===9&&j===0?'Formula title':text,userEnteredValue:j===4&&String(text).startsWith('=')?{formulaValue:text}:{stringValue:text},...(i===8&&j===4?{hyperlink:'https://drive.google.com/drive/folders/jjActual'}:{})}))}))}]}]};
 else value={sheets:[{properties:{title:'Scores'}}]};
 return new Response(JSON.stringify(value),{status:200});
};
try{
 const google=createGoogle(storage),jobs=[{id:1,folder_id:'folderA',semester:'2026 Fall'},{id:2,folder_id:'folderA',semester:'2027 Spring'},{id:3,folder_id:'folderB',semester:'2026 Fall'},{id:4,folder_id:'missing',semester:'2027 Spring'},{id:5,folder_id:'title:unlinked',semester:'2026 Fall'},{id:6,folder_id:'newDifferent',title:' Different folder ',semester:'2026 Fall'},{id:7,folder_id:'missingAmbiguous',title:'Ambiguous',semester:'2026 Fall'},{id:8,folder_id:'collisionA',title:'Job collision',semester:'2026 Fall'},{id:9,folder_id:'collisionB',title:'Job collision',semester:'2026 Fall'},{id:10,folder_id:'jjActual',title:'林俊杰2.0',semester:'2026 Fall'},{id:11,folder_id:'formulaNew',title:'Formula title',semester:'2026 Fall'}];
 assert.deepEqual(await google.recordPlanSemesters(jobs),[1,2,3,5,6,10,11]);assert.equal(cells[1][2],'2025 Fall, 2026 Fall, 2027 Spring');assert.equal(cells[2][2],'2026 Fall');assert.equal(cells[3][2],'2025 Fall, 2026 Fall');assert.equal(cells[4][2],'2025 Fall, 2026 Fall');assert.equal(cells[5][2],'2025 Fall');assert.equal(cells[6][2],'2024 Fall');assert.equal(cells[7][2],'2025 Fall');assert.equal(cells[8][2],'2025 Fall, 2026 Fall');assert.equal(cells[9][2],'2025 Fall, 2026 Fall');
 await google.recordPlanSemesters(jobs);assert.equal(writes.length,1);
 for(let i=0;i<cells.length;i++)for(const column of [0,1,3,4])assert.equal(cells[i][column],original[i][column]);
 console.log('PASS: Google batch semester append, all earlier performance semesters retained, case/space deduplication, idempotent retry, rich-text hyperlinks with different display names, rendered formula titles, unique-title fallback for changed folder links, ambiguous-title refusal, missing-row handling, and untouched titles/arrangers/formula links.');
}finally{globalThis.fetch=previousFetch;}

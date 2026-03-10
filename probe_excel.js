const xlsx = require('xlsx');

const workbook = xlsx.readFile('./兒童生長曲線摺頁之圖表原始數據.xlsx');
const sheet1 = workbook.Sheets['表1'];
const data1 = xlsx.utils.sheet_to_json(sheet1, { header: 1 });

console.log('--- Data Sample ---');
for (let i = 3; i < 8; i++) {
    console.log(`Row ${i + 1}:`, data1[i]);
}

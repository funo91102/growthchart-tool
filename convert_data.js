const fs = require('fs');
const xlsx = require('xlsx');

// 讀取 Excel 檔案
const workbook = xlsx.readFile('./兒童生長曲線摺頁之圖表原始數據.xlsx');

const parseSheet = (sheetName) => {
    const sheet = workbook.Sheets[sheetName];
    const rawData = xlsx.utils.sheet_to_json(sheet, { header: 1 });
    const parsedData = [];

    // 從第 4 列 (index 3) 開始是資料
    for (let i = 3; i < rawData.length; i++) {
        const row = rawData[i];
        if (!row || row.length === 0 || row[0] === undefined) continue;

        let ageMonths = 0;
        if (row[0] === '出生') {
            ageMonths = 0;
        } else {
            // 原資料為歲，轉換為月齡並四捨五入避免浮點數誤差
            ageMonths = Math.round(parseFloat(row[0]) * 12);
        }

        parsedData.push({
            ageMonths: ageMonths,
            weightPercentiles: {
                p3: row[1],
                p15: row[2],
                p50: row[4],  // 50th percent index
                p85: row[6],  // 85th percent index
                p97: row[7]
            },
            heightPercentiles: {
                p3: row[9],
                p15: row[10],
                p50: row[12], // 50th
                p85: row[14], // 85th
                p97: row[15]
            }
        });
    }
    return parsedData;
};

const finalData = {
    male: parseSheet('表1'),
    female: parseSheet('表2')
};

// 輸出成 JS 檔案以利本機載入 (規避 CORS 限制)
const jsContent = 'window.growthDataRawJson = ' + JSON.stringify(finalData, null, 2) + ';';
fs.writeFileSync('growthData.js', jsContent, 'utf8');
console.log('Successfully generated growthData.js!');

/**
 * 生長曲線百分位計算工具 (Growth Percentile Calculator)
 * 處理年齡介於兩個據點之間的線性插值，並回傳對應的百分位標準與身高落點區間。
 */

const fs = require('fs');

// 從檔案系統讀取轉換好的 JSON 數據
const rawData = JSON.parse(fs.readFileSync('./growthData.json', 'utf8'));

// 將 JSON 結構針對「身高」轉換為我們先前設計的一維查表格式
function formatGrowthData(dataObj) {
    const formatted = {};
    for (const gender in dataObj) {
        formatted[gender] = dataObj[gender].map(item => {
            if (item.ageMonths === null) return null; // 過濾掉空行
            return {
                ageInMonths: item.ageMonths,
                p3: item.heightPercentiles.p3,
                p15: item.heightPercentiles.p15,
                p50: item.heightPercentiles.p50,
                p85: item.heightPercentiles.p85,
                p97: item.heightPercentiles.p97
            };
        }).filter(Boolean);
    }
    return formatted;
}

const growthReferenceStandards = formatGrowthData(rawData);

/**
 * 執行兩點之間的線性插值計算 (Linear Interpolation)
 * 
 * @param {number} x - 目標 X 值 (實際月齡)
 * @param {number} x0 - 下限 X 值 (下標月齡)
 * @param {number} x1 - 上限 X 值 (上標月齡)
 * @param {number} y0 - 下限 Y 值 (下標的百分位基準值)
 * @param {number} y1 - 上限 Y 值 (上標的百分位基準值)
 * @returns {number} 插值計算後的目標 Y 值 (精確至小數點後兩位)
 */
function linearInterpolate(x, x0, x1, y0, y1) {
    if (x0 === x1) return y0;
    const interpolatedValue = y0 + ((x - x0) * (y1 - y0)) / (x1 - x0);
    return Math.round(interpolatedValue * 100) / 100; // 保留兩位小數
}

/**
 * 計算孩童身高所對應的精確百分位數值基準，並評估落點
 * 
 * @param {number} ageInMonths - 孩童年齡 (以月為單位，支援小數點表示天數比例，如 1.5)
 * @param {string} gender - 'male' 或 'female'
 * @param {number} currentHeight - 孩童當前身高 (公分)
 * @returns {Object} 包含年齡、實際身高插值後的標準，以及百分位落點評估結果
 */
function calculateHeightPercentile(ageInMonths, gender, currentHeight) {
    // 1. 取得對應性別的參考資料
    const referenceData = growthReferenceStandards[gender];
    if (!referenceData || referenceData.length === 0) {
        throw new Error("找不到該性別的生長曲線參考資料 (Missing reference data for the specified gender)");
    }

    // 防禦性設計：邊界處理
    const minAge = referenceData[0].ageInMonths;
    const maxAge = referenceData[referenceData.length - 1].ageInMonths;

    let interpolatedStandards = {};

    // 尋找完全符合的年齡點
    const exactMatch = referenceData.find(data => data.ageInMonths === ageInMonths);

    if (exactMatch) {
        interpolatedStandards = { ...exactMatch };
    } else if (ageInMonths <= minAge) {
        interpolatedStandards = { ...referenceData[0] };
    } else if (ageInMonths >= maxAge) {
        interpolatedStandards = { ...referenceData[referenceData.length - 1] };
    } else {
        // 2. 尋找相鄰的兩個數據點來進行線性插值
        let lowerPoint, upperPoint;
        for (let i = 0; i < referenceData.length - 1; i++) {
            if (ageInMonths > referenceData[i].ageInMonths && ageInMonths < referenceData[i + 1].ageInMonths) {
                lowerPoint = referenceData[i];
                upperPoint = referenceData[i + 1];
                break;
            }
        }

        // 3. 針對各百分位數進行線性插值 (p3, p15, p50, p85, p97)
        interpolatedStandards.ageInMonths = ageInMonths;
        const percentileKeys = ['p3', 'p15', 'p50', 'p85', 'p97'];

        percentileKeys.forEach(key => {
            interpolatedStandards[key] = linearInterpolate(
                ageInMonths,
                lowerPoint.ageInMonths,
                upperPoint.ageInMonths,
                lowerPoint[key],
                upperPoint[key]
            );
        });
    }

    // 4. 計算測量身高的區間落點評估 (Clinical Classification)
    let exactPctStr = "";
    const points = [
        { v: interpolatedStandards.p3, p: 3 },
        { v: interpolatedStandards.p15, p: 15 },
        { v: interpolatedStandards.p50, p: 50 },
        { v: interpolatedStandards.p85, p: 85 },
        { v: interpolatedStandards.p97, p: 97 }
    ];

    if (currentHeight <= points[0].v) {
        let p = points[0].v === 0 ? 0.1 : 3 * (currentHeight / points[0].v);
        exactPctStr = Math.max(0.1, p).toFixed(2);
    } else if (currentHeight >= points[4].v) {
        const diffV = points[4].v - points[3].v;
        let p = diffV === 0 ? 99.99 : 97 + ((currentHeight - points[4].v) / diffV) * 12;
        exactPctStr = Math.min(99.99, p).toFixed(2);
    } else {
        for (let i = 0; i < 4; i++) {
            if (currentHeight >= points[i].v && currentHeight <= points[i + 1].v) {
                const rangeV = points[i + 1].v - points[i].v;
                const rangeP = points[i + 1].p - points[i].p;
                let p = rangeV === 0 ? points[i].p : points[i].p + ((currentHeight - points[i].v) / rangeV) * rangeP;
                exactPctStr = p.toFixed(2);
                break;
            }
        }
    }

    let rangeResult = "";
    if (currentHeight <= interpolatedStandards.p3) {
        rangeResult = "<= 3rd";
    } else if (currentHeight > interpolatedStandards.p3 && currentHeight <= interpolatedStandards.p15) {
        rangeResult = "3rd - 15th";
    } else if (currentHeight > interpolatedStandards.p15 && currentHeight <= interpolatedStandards.p50) {
        rangeResult = "15th - 50th";
    } else if (currentHeight > interpolatedStandards.p50 && currentHeight <= interpolatedStandards.p85) {
        rangeResult = "50th - 85th";
    } else if (currentHeight > interpolatedStandards.p85 && currentHeight < interpolatedStandards.p97) {
        rangeResult = "85th - 97th";
    } else {
        rangeResult = ">= 97th";
    }

    let percentileResult = `${exactPctStr}th% (${rangeResult})`;


    return {
        clinicalData: {
            ageInMonths,
            gender,
            measuredHeight: currentHeight
        },
        interpolatedPercentileBounds: interpolatedStandards,
        classification: percentileResult
    };
}

// 測試範例：
// 若孩童年齡 1.5 個月 (介於 0 個月與 6 個月之間) ，身高 58 公分 男童
console.log("=== 模擬計算結果 ===");
console.log(calculateHeightPercentile(1.5, 'male', 58));

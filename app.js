/**
 * app.js
 * 結合前端 UI 邏輯與 growthCalculator 的核心運算
 */

let chartInstance = null;
let growthDataRaw = null;
let currentChartMode = 'height'; // 預設顯示身高曲線
let latestCalcContext = null;
let milestoneDataRaw = null;
let growthHistory = []; // 新增：存放歷史紀錄
let isClinicMode = false; // 診所模式旗標

document.addEventListener('DOMContentLoaded', () => {
    try {
        const urlParams = new URLSearchParams(window.location.search);
        isClinicMode = urlParams.get('mode') === 'clinic';

        if (isClinicMode) {
            const mainTitle = document.getElementById('mainTitle');
            if (mainTitle) mainTitle.innerHTML = "🏥 德昌小兒科診所 - 臨床評估模式";
            const mainSubtitle = document.getElementById('mainSubtitle');
            if (mainSubtitle) mainSubtitle.innerHTML = "快速評估生長落點（本機不留存紀錄）";

            // 診間模式：寬螢幕優化 (展開 Container)
            const mainContainer = document.getElementById('mainContainer');
            if (mainContainer) {
                mainContainer.classList.remove('max-w-4xl');
                mainContainer.classList.add('max-w-[1400px]'); // Support 1080p wide layout
            }
        }

        if (typeof window.growthDataRawJson === 'undefined') {
            throw new Error("找不到 growthDataRawJson 變數");
        }

        // 將 JSON 轉換為查表格式
        growthDataRaw = formatGrowthData(window.growthDataRawJson);
        console.log("資料載入成功", growthDataRaw);

        // 載入里程碑資料 (經由 <script> 引入 milestonesData.js 獲得)
        if (typeof window.milestoneDataRawJson !== 'undefined') {
            milestoneDataRaw = window.milestoneDataRawJson;
            console.log("里程碑資料載入成功", milestoneDataRaw.length, "筆");
        } else {
            console.warn("找不到 milestoneDataRawJson 變數");
        }

        // 初始化日期預設值 (測量日期設為今天)
        const today = new Date();
        document.getElementById('recordDate').valueAsDate = today;

        // 綁定早產兒顯示切換
        document.getElementById('isPremature').addEventListener('change', (e) => {
            const el = document.getElementById('prematureBox');
            if (e.target.checked) el.classList.remove('hidden');
            else el.classList.add('hidden');
        });

        // 綁定圖表切換按鈕
        document.getElementById('btnShowHeightChart').addEventListener('click', () => {
            currentChartMode = 'height';
            if (latestCalcContext) {
                updateUIResult();
                renderChart();
            }
        });
        document.getElementById('btnShowWeightChart').addEventListener('click', () => {
            currentChartMode = 'weight';
            if (latestCalcContext) {
                updateUIResult();
                renderChart();
            }
        });

        // 載入歷史紀錄
        const savedHistory = localStorage.getItem('growthHistory');
        if (savedHistory) {
            try {
                growthHistory = JSON.parse(savedHistory);
                console.log("載入歷史紀錄", growthHistory.length, "筆");
            } catch (e) {
                console.error("解析歷史紀錄失敗", e);
            }
        }

        // 綁定表單送出事件
        document.getElementById('calcForm').addEventListener('submit', handleFormSubmit);

        // 綁定儲存按鈕事件
        document.getElementById('btnSaveData').addEventListener('click', saveCurrentRecord);

        // 綁定匯出按鈕事件 (僅保留專業報告)
        document.getElementById('btnExportPDF').addEventListener('click', exportToPDF);

        // 綁定智慧日期輸入事件
        const bdInput = document.getElementById('birthDate');
        bdInput.addEventListener('blur', (e) => {
            const parsed = parseSmartDate(e.target.value);
            const hintEl = document.getElementById('parsedBirthDateHint');
            if (parsed) {
                // 如果解析成功，回填標準 YYYY-MM-DD 格式
                const y = parsed.getFullYear();
                const m = String(parsed.getMonth() + 1).padStart(2, '0');
                const d = String(parsed.getDate()).padStart(2, '0');
                e.target.value = `${y}-${m}-${d}`;
                hintEl.classList.add('hidden');
            } else if (e.target.value.trim() !== "") {
                hintEl.textContent = "日期格式無法辨識，請輸入如 1090319 或 2020-03-19";
                hintEl.classList.remove('hidden');
            }
        });

    } catch (error) {
        console.error("載入成長數據失敗：", error);
        alert("無法載入生長數據！請確認 growthData.js 是否有正常載入。");
    }
});

// 資料格式化 (抽取身高、體重與頭圍)
function formatGrowthData(dataObj) {
    const formatted = {};
    for (const gender in dataObj) {
        formatted[gender] = dataObj[gender].map(item => {
            if (item.ageMonths === null) return null;
            return {
                ageInMonths: item.ageMonths,
                w_p3: item.weightPercentiles?.p3,
                w_p15: item.weightPercentiles?.p15,
                w_p50: item.weightPercentiles?.p50,
                w_p85: item.weightPercentiles?.p85,
                w_p97: item.weightPercentiles?.p97,
                h_p3: item.heightPercentiles?.p3,
                h_p15: item.heightPercentiles?.p15,
                h_p50: item.heightPercentiles?.p50,
                h_p85: item.heightPercentiles?.p85,
                h_p97: item.heightPercentiles?.p97,
                hc_p3: item.hcPercentiles?.p3,
                hc_p15: item.hcPercentiles?.p15,
                hc_p50: item.hcPercentiles?.p50,
                hc_p85: item.hcPercentiles?.p85,
                hc_p97: item.hcPercentiles?.p97
            };
        }).filter(Boolean);
    }
    return formatted;
}

// 智慧日期解析函式
function parseSmartDate(input) {
    if (!input) return null;
    let str = input.replace(/\D/g, ''); // 移除所有非數字

    // 處理含有分隔符號的格式 (- 或 /)
    if (input.includes('-') || input.includes('/')) {
        const parts = input.split(/[-/]/);
        if (parts.length === 3) {
            let year = parseInt(parts[0]);
            const month = parseInt(parts[1]);
            const day = parseInt(parts[2]);
            // 如果年份是小於 1911（例如 109），視為民國年並轉換
            if (year > 0 && year <= 200) {
                year += 1911;
            }
            const d = new Date(year, month - 1, day);
            if (d.getFullYear() === year && d.getMonth() === month - 1 && d.getDate() === day) {
                return d;
            }
        }

        // 保留原生解析作為 fallback
        const d = new Date(input);
        if (!isNaN(d.getTime())) {
            // 防呆檢查：如果原生解出來的年份被誤解(例如 109 被解成 2001)，則修正
            if (d.getFullYear() < 1900 || d.getFullYear() > 2100) return null;
            return d;
        }
    }

    if (str.length === 6 || str.length === 7) {
        // 可能是民國年 (例如: 1090319 => 109-03-19, 980101 => 98-01-01)
        let rocYear, month, day;
        if (str.length === 7) {
            rocYear = parseInt(str.substring(0, 3));
            month = parseInt(str.substring(3, 5));
            day = parseInt(str.substring(5, 7));
        } else {
            rocYear = parseInt(str.substring(0, 2));
            month = parseInt(str.substring(2, 4));
            day = parseInt(str.substring(4, 6));
        }
        const ceYear = rocYear + 1911;
        const d = new Date(ceYear, month - 1, day);
        if (d.getFullYear() === ceYear && d.getMonth() === month - 1 && d.getDate() === day) return d;
    } else if (str.length === 8) {
        // 西元年 (例如: 20200319)
        const ceYear = parseInt(str.substring(0, 4));
        const month = parseInt(str.substring(4, 6));
        const day = parseInt(str.substring(6, 8));
        const d = new Date(ceYear, month - 1, day);
        if (d.getFullYear() === ceYear && d.getMonth() === month - 1 && d.getDate() === day) return d;
    }

    return null;
}

// 將小數月齡轉換為 "X 個月又 Y 天" 顯示格式
function formatAgeYearsMonths(ageMonthsFloat) {
    if (isNaN(ageMonthsFloat)) return "未知";
    if (ageMonthsFloat <= 0) return "0 個月又 0 天";

    // 計算總天數與還原月、天
    const MathMonthDays = 30.4375;
    const totalDays = Math.round(ageMonthsFloat * MathMonthDays);

    const totalMonths = Math.floor(totalDays / MathMonthDays);
    const days = Math.round(totalDays - (totalMonths * MathMonthDays));

    if (totalMonths < 12) {
        return `${totalMonths} 個月又 ${days} 天`;
    }

    const years = Math.floor(totalMonths / 12);
    const months = totalMonths % 12;
    return `${years} 歲 ${months} 個月又 ${days} 天`;
}

// 線性插值
function linearInterpolate(x, x0, x1, y0, y1) {
    if (x0 === x1) return y0;
    const val = y0 + ((x - x0) * (y1 - y0)) / (x1 - x0);
    return Math.round(val * 100) / 100;
}

// 核心百分位計算
function calculatePercentile(ageInMonths, gender, currentVal, type) {
    const referenceData = growthDataRaw[gender];
    if (!referenceData) throw new Error("無此性別資料");

    let prefix = 'w_';
    if (type === 'height') prefix = 'h_';
    else if (type === 'hc') prefix = 'hc_';

    // 篩選出該測量項目有實際給定 p50 的有效資料點
    const validData = referenceData.filter(d => d[prefix + 'p50'] !== undefined && d[prefix + 'p50'] !== null);
    if (validData.length === 0) return null;

    const minAge = validData[0].ageInMonths;
    const maxAge = validData[validData.length - 1].ageInMonths;

    // 如果年齡大於該項目的最大參考年齡，表示沒有對照數據，直接返回 null
    if (ageInMonths > maxAge) {
        return null;
    }

    let standards = {};

    const getP = (pt, key) => pt[prefix + key];
    const formatP = (pt) => ({
        ageInMonths: pt.ageInMonths,
        p3: getP(pt, 'p3'),
        p15: getP(pt, 'p15'),
        p50: getP(pt, 'p50'),
        p85: getP(pt, 'p85'),
        p97: getP(pt, 'p97')
    });

    const exactMatch = validData.find(data => data.ageInMonths === ageInMonths);

    if (exactMatch) {
        standards = formatP(exactMatch);
    } else if (ageInMonths <= minAge) {
        standards = formatP(validData[0]);
    } else {
        let lowerPoint, upperPoint;
        for (let i = 0; i < validData.length - 1; i++) {
            if (ageInMonths > validData[i].ageInMonths && ageInMonths < validData[i + 1].ageInMonths) {
                lowerPoint = validData[i];
                upperPoint = validData[i + 1];
                break;
            }
        }
        standards.ageInMonths = ageInMonths;
        ['p3', 'p15', 'p50', 'p85', 'p97'].forEach(key => {
            standards[key] = linearInterpolate(
                ageInMonths, lowerPoint.ageInMonths, upperPoint.ageInMonths,
                getP(lowerPoint, key), getP(upperPoint, key)
            );
        });
    }

    let exactPctStr = "";
    const points = [
        { v: standards.p3, p: 3 },
        { v: standards.p15, p: 15 },
        { v: standards.p50, p: 50 },
        { v: standards.p85, p: 85 },
        { v: standards.p97, p: 97 }
    ];

    let allValid = true;
    for (let pt of points) {
        if (pt.v === undefined || pt.v === null) {
            allValid = false;
        }
    }

    if (allValid && points.length === 5) {
        if (currentVal <= points[0].v) {
            let p = points[0].v === 0 ? 0.1 : 3 * (currentVal / points[0].v);
            exactPctStr = Math.max(0.1, p).toFixed(2);
        } else if (currentVal >= points[4].v) {
            const diffV = points[4].v - points[3].v;
            let p = diffV === 0 ? 99.99 : 97 + ((currentVal - points[4].v) / diffV) * 12;
            exactPctStr = Math.min(99.99, p).toFixed(2);
        } else {
            for (let i = 0; i < 4; i++) {
                if (currentVal >= points[i].v && currentVal <= points[i + 1].v) {
                    const rangeV = points[i + 1].v - points[i].v;
                    const rangeP = points[i + 1].p - points[i].p;
                    let p = rangeV === 0 ? points[i].p : points[i].p + ((currentVal - points[i].v) / rangeV) * rangeP;
                    exactPctStr = p.toFixed(2);
                    break;
                }
            }
        }
    }

    let pResult = "";
    let rangeResult = "";
    let isExtreme = false;
    let extremeType = "";

    if (currentVal <= standards.p3) {
        rangeResult = "<= 3rd";
        isExtreme = true;
        extremeType = "<= 3rd";
    } else if (currentVal > standards.p3 && currentVal <= standards.p15) {
        rangeResult = "3rd - 15th";
    } else if (currentVal > standards.p15 && currentVal <= standards.p50) {
        rangeResult = "15th - 50th";
    } else if (currentVal > standards.p50 && currentVal <= standards.p85) {
        rangeResult = "50th - 85th";
    } else if (currentVal > standards.p85 && currentVal < standards.p97) {
        rangeResult = "85th - 97th";
    } else {
        rangeResult = ">= 97th";
        isExtreme = true;
        extremeType = ">= 97th";
    }

    if (exactPctStr !== "") {
        pResult = `${exactPctStr}th% (${rangeResult})`;
    } else {
        pResult = rangeResult;
    }

    return { standards, pResult, isExtreme, extremeType };
}

// 評估 BMI (依據衛福部兒少體位標準)
function evaluateBMI(ageMonths, gender, bmi) {
    const bmiGender = gender === 'male' ? 'boy' : 'girl';
    if (!window.bmiDataRawJson || !window.bmiDataRawJson[bmiGender]) return null;
    const ageYears = ageMonths / 12;
    // 找出最接近的半歲切點
    const ageKeys = Object.keys(window.bmiDataRawJson[bmiGender]).map(Number).sort((a, b) => a - b);
    let closestAge = ageKeys[0];
    let minDiff = Math.abs(ageYears - closestAge);
    for (let i = 1; i < ageKeys.length; i++) {
        const diff = Math.abs(ageYears - ageKeys[i]);
        if (diff < minDiff) {
            minDiff = diff;
            closestAge = ageKeys[i];
        }
    }

    // array format: [uw_cutoff(same as n_min), n_min, n_max(same as ow_cutoff), ow_cutoff, ob_cutoff]
    // 尋找原始的 string key (例如 "0.5" 或 "1")
    let keyStr = Object.keys(window.bmiDataRawJson[bmiGender]).find(k => Number(k) === closestAge);
    if (!keyStr) keyStr = String(closestAge); // fallback

    const cutoffs = window.bmiDataRawJson[bmiGender][keyStr];
    if (!cutoffs || cutoffs.length < 5) return null;

    const uwCutoff = cutoffs[0];
    const owCutoff = cutoffs[3];
    const obCutoff = cutoffs[4];

    let status = "";
    let isWarning = false;

    if (bmi < uwCutoff) {
        status = "過輕";
        isWarning = true;
    } else if (bmi >= uwCutoff && bmi < owCutoff) {
        status = "正常範圍";
    } else if (bmi >= owCutoff && bmi < obCutoff) {
        status = "過重";
        isWarning = true;
    } else if (bmi >= obCutoff) {
        status = "肥胖";
        isWarning = true;
    }

    return { bmi: parseFloat(bmi.toFixed(1)), status, isWarning, referenceAge: closestAge };
}

// 評估發展里程碑
function evaluateMilestones(ageInMonths, data) {
    let currentInterval = null;
    let previousInterval = null;

    for (let i = 0; i < data.length; i++) {
        const interval = data[i];
        if (i === data.length - 1) {
            if (ageInMonths >= interval.min && ageInMonths <= interval.max) {
                currentInterval = interval;
                if (i > 0) previousInterval = data[i - 1];
                break;
            }
        } else {
            if (ageInMonths >= interval.min && ageInMonths < interval.max) {
                currentInterval = interval;
                if (i > 0) previousInterval = data[i - 1];
                break;
            }
        }
    }

    if (!currentInterval && data.length > 0 && ageInMonths > data[data.length - 1].max) {
        previousInterval = data[data.length - 1];
    }

    const expected = currentInterval ? currentInterval.items : [];
    const warning = previousInterval ? previousInterval.items : [];
    const currentLabel = currentInterval ? currentInterval.label : null;

    return { expected, warning, currentLabel };
}

function handleFormSubmit(e) {
    if (e) e.preventDefault();

    const gender = document.getElementById('gender').value;
    const bStr = document.getElementById('birthDate').value;
    const bDate = parseSmartDate(bStr);

    if (!bDate || bDate.getFullYear() < 1900 || bDate.getFullYear() > 2100) {
        alert("出生日期格式無效或年份超出合理範圍！請重新輸入。");
        return;
    }

    const rDateStr = document.getElementById('recordDate').value;
    const rDate = new Date(rDateStr);

    if (!rDateStr || isNaN(rDate.getTime()) || rDate.getFullYear() < 1900 || rDate.getFullYear() > 2100) {
        alert("測量日期異常，請確認日期是否輸入正確！");
        return;
    }

    // 計算天數差
    const diffTime = rDate - bDate;
    if (diffTime < 0) {
        alert("測量日期不能早於出生日期！");
        return;
    }

    let diffDays = diffTime / (1000 * 60 * 60 * 24);
    const MathMonthDays = 30.4375; // 每年平均月天數
    let actualAgeMonths = diffDays / MathMonthDays;

    let customWarnings = [];

    // 早產兒矯正年齡計算邏輯
    const isPremature = document.getElementById('isPremature').checked;
    if (isPremature) {
        let weeks = 0;
        let days = 0;
        const gaInput = document.getElementById('gestationalAgeInput').value.trim();

        if (gaInput) {
            // 支援 34+5 或 34.5 等寫法，統一取代為 + 以便切割
            const parts = gaInput.replace('.', '+').split('+');
            weeks = parseInt(parts[0]) || 0;
            if (parts.length > 1) {
                days = parseInt(parts[1]) || 0;
            }
        }

        const totalGestationalDays = weeks * 7 + days;

        if (weeks > 0 && weeks < 24) {
            customWarnings.push({
                type: 'info',
                msg: '小於24週之極低早產兒，建議配合醫師詳細評估各項生長與神經發育指標。'
            });
        }

        // 預產期是 40 週 (280天)
        if (totalGestationalDays > 0 && totalGestationalDays < 280) {

            if (actualAgeMonths > 24) {
                // 超過兩歲停止矯正
                customWarnings.push({
                    type: 'info',
                    msg: '孩童實際年齡已滿兩歲，依據醫學指引通常不再進行早產矯正，圖表將以實際年齡繪製。'
                });
            } else {
                const missingDays = 280 - totalGestationalDays;
                diffDays = diffDays - missingDays;
                if (diffDays < 0) {
                    customWarnings.push({
                        type: 'info',
                        msg: '依據矯正年齡，孩童尚未達到預產期時間喔！圖表將以 0 個月計算。'
                    });
                    diffDays = 0;
                }
            }
        }
    }

    const ageMonths = diffDays / MathMonthDays;

    const height = parseFloat(document.getElementById('height').value);
    const weight = parseFloat(document.getElementById('weight').value);

    const resH = calculatePercentile(ageMonths, gender, height, 'height');
    const resW = calculatePercentile(ageMonths, gender, weight, 'weight');

    // 計算頭圍
    const headCircInput = document.getElementById('headCirc').value;
    const hasHC = headCircInput && headCircInput.trim() !== "";
    let resHC = null;
    let headCirc = null;
    if (hasHC) {
        headCirc = parseFloat(headCircInput);
        if (!isNaN(headCirc)) {
            try {
                resHC = calculatePercentile(ageMonths, gender, headCirc, 'hc');
            } catch (e) {
                // 如果年齡超出 WHO 頭圍表(0-5歲)，可能無法計算頭圍百分位
                console.log("超出頭圍計算年齡範圍");
            }
        }
    }

    // 計算 BMI
    // BMI = weight(kg) / (height(m)^2)
    const heightInMeters = height / 100;
    const bmiVal = weight / (heightInMeters * heightInMeters);
    const resBMI = evaluateBMI(ageMonths, gender, bmiVal);

    // 評估發展里程碑 (使用實際年齡 actualAgeMonths 進行粗略評估，若早產兒也可考慮使用 ageMonths，視臨床需求，這裡我們依據標準使用矯正月齡 ageMonths 推算)
    let milestonesInfo = null;
    if (milestoneDataRaw && ageMonths >= 0) {
        // 取 0.5 個月的緩衝或直接使用 ageMonths
        milestonesInfo = evaluateMilestones(ageMonths, milestoneDataRaw);
    }

    latestCalcContext = { bDate, gender, ageMonths, actualAgeMonths, customWarnings, height, weight, headCirc, resHC, resH, resW, resBMI, milestonesInfo };

    updateUIResult();
    renderChart();
}

function updateUIResult() {
    const { bDate, gender, ageMonths, actualAgeMonths, customWarnings, height, weight, headCirc, resHC, resH, resW, resBMI, milestonesInfo } = latestCalcContext;
    document.getElementById('resultCard').classList.remove('hidden');

    if (isClinicMode) {
        // 診間模式：改為水平排列
        const resultsWrapper = document.getElementById('resultsWrapper');
        if (resultsWrapper) {
            resultsWrapper.classList.remove('flex-col', 'space-y-6', 'sm:space-y-8');
            resultsWrapper.classList.add('lg:flex-row', 'lg:space-x-8', 'lg:space-y-0');
        }

        // 調降結果卡片的寬度佔比，讓圖表可以並排
        const resultCard = document.getElementById('resultCard');
        if (resultCard) {
            resultCard.classList.remove('w-full');
            resultCard.classList.add('lg:w-1/2');
        }

        // 展開圖表，放右邊並排
        const chartBox = document.getElementById('chartBox');
        if (chartBox) {
            chartBox.classList.remove('hidden', 'w-full');
            chartBox.classList.add('block', 'lg:w-1/2');
        }

        // 數據卡片橫向並排 (高密度 Row layout)
        const metricsGrid = document.getElementById('metricsGrid');
        if (metricsGrid) {
            metricsGrid.className = 'flex flex-row gap-2 sm:gap-3 mb-4 overflow-x-auto no-scrollbar';
            const cards = metricsGrid.querySelectorAll('.card-metric');
            cards.forEach(card => {
                card.classList.remove('p-4', 'sm:p-5');
                card.classList.add('p-3', 'flex-1', 'min-w-[120px]');
            });
        }

        const ageCard = document.getElementById('resAge')?.closest('.card-metric');
        if (ageCard) {
            ageCard.classList.remove('p-4', 'sm:p-5');
            ageCard.classList.add('p-3');
        }
    } else {
        const chartBox = document.getElementById('chartBox');
        if (chartBox) {
            chartBox.classList.remove('hidden');
        }
    }

    // 顯示儲存與匯出按鈕
    if (!isClinicMode) {
        document.getElementById('btnSaveData').classList.remove('hidden');
    } else {
        document.getElementById('btnSaveData').classList.add('hidden');
    }

    document.getElementById('btnExportPDF').classList.remove('hidden');

    // 更新性別徽章
    const badge = document.getElementById('genderBadge');
    const badgeText = document.getElementById('genderBadgeText');
    if (badgeText) {
        badgeText.textContent = gender === 'male' ? '男童' : '女童';
        badge.className = gender === 'male'
            ? 'px-3 py-1 rounded-full bg-blue-100 flex items-center justify-center'
            : 'px-3 py-1 rounded-full bg-pink-100 flex items-center justify-center';
        badgeText.className = gender === 'male'
            ? 'text-sm font-bold text-blue-800 tracking-wider'
            : 'text-sm font-bold text-pink-800 tracking-wider';
    } else {
        // Fallback
        badge.textContent = gender === 'male' ? '男童' : '女童';
        badge.className = gender === 'male'
            ? 'px-3 py-1 rounded-full text-sm font-semibold bg-blue-100 text-blue-800'
            : 'px-3 py-1 rounded-full text-sm font-semibold bg-pink-100 text-pink-800';
    }

    // 更新數值與卡片顯示
    const ageDisplayStr = formatAgeYearsMonths(ageMonths);
    document.getElementById('resAge').textContent = ageDisplayStr;
    document.getElementById('resAge').nextElementSibling.textContent = ""; // 清除「個月」後綴文字

    // 格式化並顯示出生日期
    if (bDate && !isNaN(bDate)) {
        const y = bDate.getFullYear();
        const m = String(bDate.getMonth() + 1).padStart(2, '0');
        const d = String(bDate.getDate()).padStart(2, '0');
        document.getElementById('resBirthDate').textContent = `${y}/${m}/${d}`;
    } else {
        document.getElementById('resBirthDate').textContent = "--/--/--";
    }

    document.getElementById('resHeightVal').textContent = height.toFixed(1);
    document.getElementById('resHeightPct').textContent = resH.pResult;
    document.getElementById('resWeightVal').textContent = weight.toFixed(2);
    document.getElementById('resWeightPct').textContent = resW.pResult;

    // 更新頭圍卡片
    const hcCard = document.getElementById('hcCard');
    if (resHC) {
        hcCard.classList.remove('hidden');
        document.getElementById('resHeadCircVal').textContent = headCirc.toFixed(1);
        document.getElementById('resHeadCircPct').textContent = resHC.pResult;
    } else {
        hcCard.classList.add('hidden');
    }

    // 更新 BMI 卡片
    const bmiCard = document.getElementById('bmiCard');
    if (resBMI) {
        bmiCard.classList.remove('hidden');
        document.getElementById('resBmiVal').textContent = resBMI.bmi.toFixed(1);
        document.getElementById('resBmiPct').textContent = resBMI.status;

        // 顏色切換
        const pctEl = document.getElementById('resBmiPct');
        pctEl.className = 'text-sm font-bold ' + (resBMI.isWarning ? 'text-orange-600' : 'text-slate-800');
    } else {
        bmiCard.classList.add('hidden');
    }

    // 清除選取狀態
    document.getElementById('btnShowHeightChart').classList.remove('ring-2', 'ring-medical-500');
    document.getElementById('btnShowWeightChart').classList.remove('ring-2', 'ring-medical-500');
    if (currentChartMode === 'height') {
        document.getElementById('btnShowHeightChart').classList.add('ring-2', 'ring-medical-500');
    } else {
        document.getElementById('btnShowWeightChart').classList.add('ring-2', 'ring-medical-500');
    }

    // 更新醫師溫馨提醒
    const warningBox = document.getElementById('warningBox');
    let warnings = [];
    let isSevere = false;
    let hasInfo = false;

    if (resH.isExtreme) {
        warnings.push(`身高(${resH.extremeType})`);
        if (resH.extremeType.includes('3rd')) isSevere = true;
    }
    if (resW.isExtreme) {
        warnings.push(`體重(${resW.extremeType})`);
        if (resW.extremeType.includes('3rd')) isSevere = true;
    }
    if (resHC && resHC.isExtreme) {
        warnings.push(`頭圍(${resHC.extremeType})`);
    }
    if (resBMI && resBMI.isWarning) {
        warnings.push(`BMI狀態(${resBMI.status})`);
    }

    let warningHtmlContent = "";

    if (warnings.length > 0) {
        warningHtmlContent += `<p class="mb-1">該數值偏離一般群體中央值（落在 <span>${warnings.join('、')}</span>）。建議與您的兒科醫師討論寶寶近期的飲食與生長狀況。</p>`;
    }

    if (customWarnings && customWarnings.length > 0) {
        customWarnings.forEach(cw => {
            warningHtmlContent += `<p class="mb-1">${cw.msg}</p>`;
            if (cw.type === 'info') hasInfo = true;
        });
    }

    if (warningHtmlContent !== "") {
        warningBox.classList.remove('hidden');

        let colorTitle = 'text-orange-700';
        let colorIcon = 'text-orange-400';
        let bgColor = 'bg-orange-50 border-orange-500';

        if (isSevere) {
            colorTitle = 'text-rose-700';
            colorIcon = 'text-rose-400';
            bgColor = 'bg-rose-50 border-rose-500';
        } else if (warnings.length === 0 && hasInfo) {
            colorTitle = 'text-blue-700';
            colorIcon = 'text-blue-400';
            bgColor = 'bg-blue-50 border-blue-500';
        }

        warningBox.className = `mt-4 border-l-4 p-4 rounded-r-lg ${bgColor}`;
        warningBox.innerHTML = `
            <div class="flex">
                <div class="flex-shrink-0">
                    <svg class="h-5 w-5 ${colorIcon}" viewBox="0 0 20 20" fill="currentColor">
                        <path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd" />
                    </svg>
                </div>
                <div class="ml-3">
                    <p class="text-sm ${colorTitle} font-medium">
                        <strong>醫師溫馨提醒：</strong><br>
                        ${warningHtmlContent}
                    </p>
                </div>
            </div>`;
    } else {
        warningBox.classList.add('hidden');
    }

    // 渲染發展小提醒
    const milestoneBox = document.getElementById('milestoneBox');
    if (milestoneBox && milestonesInfo) {
        milestoneBox.classList.remove('hidden');

        // 更新標題顯示對應區間
        const titleText = document.getElementById('milestoneTitleText');
        if (titleText) {
            if (milestonesInfo.currentLabel) {
                titleText.textContent = `發展小提醒（目前對應健檢區間：${milestonesInfo.currentLabel}）`;
            } else {
                titleText.textContent = "發展小提醒";
            }
        }

        const expList = document.getElementById('milestoneExpectedList');
        const warnList = document.getElementById('milestoneWarningList');
        const warnSection = document.getElementById('milestoneWarningSection');

        let expHtml = '';
        if (milestonesInfo.expected.length > 0) {
            expHtml = '<li class="mb-2 list-disc ml-5">' + milestonesInfo.expected.join('</li><li class="mb-2 list-disc ml-5">') + '</li>';
        } else {
            expHtml = '<li class="text-slate-500 text-sm">此年齡區間暫無特別列出的發展指標，或孩子已邁入下個成長階段。</li>';
        }
        expList.innerHTML = expHtml;

        let warnHtml = '';
        if (milestonesInfo.warning.length > 0) {
            warnSection.classList.remove('hidden');
            warnHtml = '<li>' + milestonesInfo.warning.join('</li><li>') + '</li>';
        } else {
            warnSection.classList.add('hidden');
        }
        warnList.innerHTML = warnHtml;

    } else if (milestoneBox) {
        milestoneBox.classList.add('hidden');
    }

    // 更新並繪製預約 QR Code
    const qrCanvas = document.getElementById('qrCodeCanvas');
    if (qrCanvas && window.QRious) {
        new QRious({
            element: qrCanvas,
            value: 'https://calendar.google.com/calendar/u/0/appointments/schedules/AcZssZ0BliUPobtHkYaU5ynk4Qml2s1h_wcDUHLP5c4iWa1mDiunH2phcGckM1Re5RGMxX8nxNs9RxEA',
            size: 96, // 約 2.5cm 在螢幕上的合理像素大小 (96px)
            level: 'H' // 高容錯，確保縮放掃描清晰
        });
    }
}

// 儲存當前量測紀錄至 localStorage
function saveCurrentRecord() {
    if (!latestCalcContext) return;
    const recordDateStr = document.getElementById('recordDate').value;
    const { gender, ageMonths, height, weight, headCirc } = latestCalcContext;

    const existingIdx = growthHistory.findIndex(r => r.date === recordDateStr && r.gender === gender);
    const newRecord = {
        date: recordDateStr,
        gender,
        ageMonths: parseFloat(ageMonths.toFixed(2)),
        height: parseFloat(height.toFixed(1)),
        weight: parseFloat(weight.toFixed(2)),
        headCirc: headCirc !== null && headCirc !== undefined ? parseFloat(headCirc.toFixed(1)) : null
    };

    if (existingIdx !== -1) {
        growthHistory[existingIdx] = newRecord;
    } else {
        growthHistory.push(newRecord);
    }

    growthHistory.sort((a, b) => a.ageMonths - b.ageMonths);
    localStorage.setItem('growthHistory', JSON.stringify(growthHistory));

    alert(`已儲存 ${recordDateStr} 的量測資料！`);

    // 重繪繪製歷史線
    renderChart();
}

function createChartConfig(mode) {
    const { gender, ageMonths, height, weight } = latestCalcContext;
    let maxAgeMonths = 24;
    let chartLabel = "0~2 歲";
    let tickStep = 3;

    if (ageMonths > 24) {
        maxAgeMonths = 84;
        chartLabel = "0~7 歲";
        tickStep = 12;
    }

    const chartData = growthDataRaw[gender].filter(d => d.ageInMonths <= maxAgeMonths);
    const labels = chartData.map(d => d.ageInMonths);

    const isHeight = mode === 'height';
    const prefix = isHeight ? 'h_' : 'w_';
    const currentVal = isHeight ? height : weight;
    const yTitle = isHeight ? '身高 (cm)' : '體重 (kg)';

    const yMin = isHeight ? (maxAgeMonths > 24 ? 60 : 40) : (maxAgeMonths > 24 ? 5 : 1);
    const yMax = isHeight ? (maxAgeMonths > 24 ? 135 : 95) : (maxAgeMonths > 24 ? 35 : 18);

    const datasets = [
        { label: '97th', data: chartData.map(d => d[prefix + 'p97']), borderColor: '#9ca3af', borderWidth: 1.5, tension: 0.4, pointRadius: 0 },
        { label: '85th', data: chartData.map(d => d[prefix + 'p85']), borderColor: '#cbd5e1', borderWidth: 1.5, tension: 0.4, pointRadius: 0 },
        { label: '50th', data: chartData.map(d => d[prefix + 'p50']), borderColor: '#14b8a6', borderWidth: 2.5, tension: 0.4, pointRadius: 0 },
        { label: '15th', data: chartData.map(d => d[prefix + 'p15']), borderColor: '#cbd5e1', borderWidth: 1.5, tension: 0.4, pointRadius: 0 },
        { label: '3rd', data: chartData.map(d => d[prefix + 'p3']), borderColor: '#9ca3af', borderWidth: 1.5, tension: 0.4, pointRadius: 0 }
    ];

    // 新增：繪製歷史趨勢線 (結合歷史紀錄與目前測量點)
    const historyData = growthHistory.filter(r => r.gender === gender);
    let mappedHistory = historyData.map(h => {
        let historyVal = isHeight ? h.height : h.weight;
        return { x: h.ageMonths, y: historyVal };
    }).filter(p => p.y !== null && p.y !== undefined && p.x <= maxAgeMonths);

    // 將目前的測量點加入連線陣列
    mappedHistory.push({ x: ageMonths, y: currentVal });

    // 依據月齡做排序以確保連線順序正確
    mappedHistory.sort((a, b) => a.x - b.x);

    // 過濾掉可能因為剛剛儲存過而產生的相同座標重複點
    mappedHistory = mappedHistory.filter((p, index, self) =>
        index === self.findIndex((t) => (t.x === p.x && t.y === p.y))
    );

    if (mappedHistory.length > 1) {
        datasets.push({
            type: 'line',
            label: '生長趨勢連線',
            data: mappedHistory,
            borderColor: '#3b82f6', // 藍色線條
            backgroundColor: '#93c5fd',
            borderWidth: 2,
            pointRadius: 4,
            tension: 0.1,
            fill: false,
            order: 1 // 畫在底下
        });
    } else if (mappedHistory.length === 1 && historyData.length > 0) {
        // 若只有單點也可以畫出 (不過通常 > 1 才有線)
        datasets.push({
            type: 'line',
            label: '歷史生長軌跡',
            data: mappedHistory,
            borderColor: '#3b82f6',
            backgroundColor: '#93c5fd',
            borderWidth: 2,
            pointRadius: 4,
            tension: 0.1,
            fill: false,
            order: 1
        });
    }

    datasets.push({
        type: 'scatter', label: '目前量測落點',
        data: [{ x: ageMonths, y: currentVal }],
        backgroundColor: '#ef4444', borderColor: '#fca5a5', borderWidth: 2, pointRadius: 6, pointHoverRadius: 8,
        order: 0 // 最上層
    });

    return {
        type: 'line',
        data: { labels, datasets },
        options: {
            responsive: true, maintainAspectRatio: false,
            animation: false, // 關閉動畫方便匯出截圖
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 12 } } },
                title: { display: false }
            },
            scales: {
                x: {
                    type: 'linear',
                    title: { display: true, text: '校正後月齡 (Months)' },
                    min: 0, max: maxAgeMonths,
                    ticks: { stepSize: tickStep }
                },
                y: { title: { display: true, text: yTitle }, min: yMin, max: yMax }
            }
        },
        chartLabel // 自訂屬性，方便呼叫端取得標題標籤
    };
}

// 修改原有的 renderChart
function renderChart() {
    const ctx = document.getElementById('growthChart').getContext('2d');
    const config = createChartConfig(currentChartMode);

    // UI 主圖表開啟動畫
    config.options.animation = true;
    document.getElementById('chartAgeRangeLabel').textContent = config.chartLabel;

    if (chartInstance) chartInstance.destroy();
    chartInstance = new Chart(ctx, config);
}

// 修改原廠標題，以明確標示身高或體重，增加匯出辨識度
function getChartTitleText(mode, ageLabel) {
    const isHeight = mode === 'height';
    return `近期${isHeight ? '身高' : '體重'}曲線圖 (${ageLabel})`;
}

// 匯出功能實作
async function captureExportArea() {
    const container = document.getElementById('exportContainer');

    // 取得當前圖表跟要補充的圖表
    const isHeight = currentChartMode === 'height';
    const missingMode = isHeight ? 'weight' : 'height';

    // 修改原圖目標題，使其明確標示身高或體重
    const chartCard = document.getElementById('growthChart').closest('.bg-white.rounded-2xl');
    let origTitleHTML = "";
    let origTitleElement = null;
    let tempContainer = null;
    let tempChartInstance = null;

    if (chartCard) {
        // 先取得年齡區間標籤，以免被 DOM 操作覆蓋
        const ageLabelEl = document.getElementById('chartAgeRangeLabel');
        const ageLabel = ageLabelEl ? ageLabelEl.textContent : "0~7 歲";

        // 修改原本標題
        origTitleElement = chartCard.querySelector('h3');
        if (origTitleElement) {
            origTitleHTML = origTitleElement.innerHTML;
            const currentTitleText = getChartTitleText(currentChartMode, ageLabel);
            origTitleElement.innerHTML = `<svg class="w-5 h-5 mr-2 text-medical-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z"></path></svg>${currentTitleText}`;
        }

        // 動態建立第二個圖表區塊
        const missingTitleText = getChartTitleText(missingMode, ageLabel);

        const tempTitle = document.createElement('h3');
        tempTitle.className = "text-lg font-bold text-slate-700 mb-4 pb-2 border-b border-slate-100 flex items-center mt-8 pt-4"; // 增加頂部間距與分隔線
        tempTitle.innerHTML = `<svg class="w-5 h-5 mr-2 text-medical-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z"></path></svg>${missingTitleText}`;
        chartCard.appendChild(tempTitle);

        tempContainer = document.createElement('div');
        tempContainer.className = "relative h-80 w-full"; // 同原本圖表的高度
        const tempCanvas = document.createElement('canvas');
        tempContainer.appendChild(tempCanvas);
        chartCard.appendChild(tempContainer);

        // 繪製第二圖表
        const config = createChartConfig(missingMode);
        tempChartInstance = new Chart(tempCanvas.getContext('2d'), config);

        // 加入浮水印
        const watermarkEl = document.createElement('div');
        watermarkEl.id = 'exportWatermark';
        watermarkEl.className = 'w-full text-right mt-6 pr-4 text-slate-400 font-medium text-sm flex justify-end items-center space-x-1';
        watermarkEl.innerHTML = `<span>Powered by 德昌小兒科診所🐸</span>`;
        chartCard.appendChild(watermarkEl);

        // UI 等待一下讓 Chart.js 畫完
        await new Promise(r => setTimeout(r, 600));
    }

    try {
        const canvas = await html2canvas(container, {
            scale: 3, // 提高解析度確保縮放不模糊
            useCORS: true,
            backgroundColor: '#f8fafc' // 對應 body 背景色
        });
        return canvas;
    } finally {
        // 清理與恢復 DOM
        if (tempChartInstance) tempChartInstance.destroy();
        if (chartCard && tempContainer) {
            chartCard.removeChild(document.getElementById('exportWatermark')); // 移除浮水印
            chartCard.removeChild(chartCard.lastElementChild); // canvas container
            chartCard.removeChild(chartCard.lastElementChild); // title
            // 恢復原圖標題
            origTitleElement.innerHTML = origTitleHTML;
        }
    }
}

async function exportToImage() {
    const origText = document.getElementById('btnExportImage').innerHTML;
    document.getElementById('btnExportImage').innerHTML = '產生中...';
    try {
        const canvas = await captureExportArea();
        const imgData = canvas.toDataURL('image/png');

        const link = document.createElement('a');
        link.download = `兒童生長曲線評估_${new Date().toISOString().split('T')[0]}.png`;
        link.href = imgData;
        link.click();
    } catch (err) {
        console.error("匯出圖片失敗", err);
        alert("匯出圖片失敗，請稍後再試。");
    } finally {
        document.getElementById('btnExportImage').innerHTML = origText;
    }
}

async function exportToPDF() {
    const origText = document.getElementById('btnExportPDF').innerHTML;
    document.getElementById('btnExportPDF').innerHTML = '產生中...';
    try {
        const canvas = await captureExportArea();
        const imgWidth = 210; // A4 width in mm
        const pageHeight = 297; // A4 height in mm
        let imgHeight = (canvas.height * imgWidth) / canvas.width;

        let finalWidth = imgWidth;
        let finalHeight = imgHeight;

        // 若高度超過 A4 一頁 (保留邊距)，等比例縮小寬度與高度
        if (imgHeight > pageHeight - 20) {
            finalHeight = pageHeight - 20;
            finalWidth = (canvas.width * finalHeight) / canvas.height;
        }

        const imgData = canvas.toDataURL('image/png');
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF('p', 'mm', 'a4');

        const xOffset = (210 - finalWidth) / 2; // 置中
        doc.addImage(imgData, 'PNG', xOffset, 10, finalWidth, finalHeight);

        doc.save(`兒童生長曲線評估_${new Date().toISOString().split('T')[0]}.pdf`);
    } catch (err) {
        console.error("匯出 PDF 失敗", err);
        alert("匯出 PDF 失敗，請稍後再試。");
    } finally {
        document.getElementById('btnExportPDF').innerHTML = origText;
    }
}

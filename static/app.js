// 全局变量声明
let dateInput;
let chartContainer;
let fileUploadSection;
let dbFileInput;

// 获取中文星期几
function getChineseDayOfWeek(date) {
    const days = ['日', '一', '二', '三', '四', '五', '六'];
    return '周' + days[date.getDay()];
}

// 更新星期几显示
function updateDayOfWeek(date) {
    const dayOfWeekElement = document.getElementById('day-of-week');
    if (dayOfWeekElement) {
        dayOfWeekElement.textContent = getChineseDayOfWeek(date);
    }
}

// Flatpickr 实例
let flatpickrInstance;
let uploadButton;
let uploadStatus;

// 数据库状态
let uploadedFile = null;
let loadedDb = null; // 已加载的数据库对象

// SQL.js 初始化
let SQL;
let sqlReady = false;

// macOS 时间戳偏移量
const MACOS_EPOCH_OFFSET = 978307200;

// 日期导航函数
function navigateDate(days) {
    if (!loadedDb) {
        uploadStatus.innerHTML = '<p style="color: red;">数据库还未加载，请先上传数据库文件</p>';
        return;
    }

    // 获取可用日期列表
    try {
        const query = `
        SELECT DISTINCT
            date(ZOBJECT.ZSTARTDATE + ${MACOS_EPOCH_OFFSET}, 'unixepoch', 'localtime') as date
        FROM 
            ZOBJECT
        WHERE 
            ZSTREAMNAME = '/app/usage' 
            AND ZOBJECT.ZVALUESTRING IS NOT NULL
        ORDER BY 
            date
        `;

        const results = loadedDb.exec(query);

        if (results.length === 0 || results[0].values.length === 0) {
            uploadStatus.innerHTML = '<p style="color: orange;">数据库中没有找到任何日期的数据</p>';
            return;
        }

        const availableDates = results[0].values.map(row => row[0]);

        // 获取当前选中的日期
        const currentDate = flatpickrInstance.selectedDates[0] || new Date();
        const formattedCurrentDate = currentDate.getFullYear() + '-' +
            String(currentDate.getMonth() + 1).padStart(2, '0') + '-' +
            String(currentDate.getDate()).padStart(2, '0');

        // 找到当前日期在可用日期列表中的索引
        const currentIndex = availableDates.indexOf(formattedCurrentDate);

        if (currentIndex !== -1) {
            // 如果当前日期在列表中，则导航到相应的日期
            const targetIndex = currentIndex + days;

            if (targetIndex >= 0 && targetIndex < availableDates.length) {
                // 如果目标索引有效，则选择该日期
                flatpickrInstance.setDate(availableDates[targetIndex]);
                updateDayOfWeek(flatpickrInstance.selectedDates[0]);
                queryDatabase();
            } else {
                // 如果目标索引无效，则显示错误消息
                if (days > 0) {
                    uploadStatus.innerHTML = '<p style="color: orange;">已经是最后一个有数据的日期</p>';
                } else {
                    uploadStatus.innerHTML = '<p style="color: orange;">已经是第一个有数据的日期</p>';
                }
            }
        } else {
            // 如果当前日期不在列表中，则选择第一个或最后一个日期
            const targetDate = days > 0 ? availableDates[0] : availableDates[availableDates.length - 1];
            flatpickrInstance.setDate(targetDate);
            updateDayOfWeek(flatpickrInstance.selectedDates[0]);
            uploadStatus.innerHTML = `<p style="color: blue;">当前日期无数据，已自动选择有数据的日期: ${targetDate}</p>`;
            queryDatabase();
        }
    } catch (error) {
        console.error('日期导航失败:', error);
        uploadStatus.innerHTML = `<p style="color: red;">日期导航失败: ${error.message}</p>`;
    }
}

// 导航到今天的函数
function navigateToday() {
    if (!loadedDb) {
        uploadStatus.innerHTML = '<p style="color: red;">数据库还未加载，请先上传数据库文件</p>';
        return;
    }

    const today = new Date();
    const formattedToday = today.getFullYear() + '-' +
        String(today.getMonth() + 1).padStart(2, '0') + '-' +
        String(today.getDate()).padStart(2, '0');

    // 检查今天是否有数据
    try {
        const query = `
        SELECT COUNT(*) as count
        FROM ZOBJECT
        WHERE 
            ZSTREAMNAME = '/app/usage' 
            AND date(ZOBJECT.ZSTARTDATE + ${MACOS_EPOCH_OFFSET}, 'unixepoch', 'localtime') = '${formattedToday}'
            AND ZOBJECT.ZVALUESTRING IS NOT NULL
        `;

        const results = loadedDb.exec(query);

        if (results.length > 0 && results[0].values.length > 0 && results[0].values[0][0] > 0) {
            // 如果今天有数据，则直接选择今天
            flatpickrInstance.setDate(today);
            updateDayOfWeek(today);
            queryDatabase();
        } else {
            // 如果今天没有数据，则选择最近的有数据的日期
            const dateQuery = `
            SELECT 
                date(ZOBJECT.ZSTARTDATE + ${MACOS_EPOCH_OFFSET}, 'unixepoch', 'localtime') as date
            FROM 
                ZOBJECT
            WHERE 
                ZSTREAMNAME = '/app/usage' 
                AND ZOBJECT.ZVALUESTRING IS NOT NULL
            ORDER BY 
                date DESC
            LIMIT 1
            `;

            const dateResults = loadedDb.exec(dateQuery);

            if (dateResults.length > 0 && dateResults[0].values.length > 0) {
                const latestDate = dateResults[0].values[0][0];
                flatpickrInstance.setDate(latestDate);
                updateDayOfWeek(flatpickrInstance.selectedDates[0]);
                uploadStatus.innerHTML = `<p style="color: blue;">今天无数据，已自动选择最近的有数据的日期: ${latestDate}</p>`;
                queryDatabase();
            } else {
                uploadStatus.innerHTML = '<p style="color: orange;">数据库中没有找到任何日期的数据</p>';
            }
        }
    } catch (error) {
        console.error('导航到今天失败:', error);
        uploadStatus.innerHTML = `<p style="color: red;">导航到今天失败: ${error.message}</p>`;
    }
}

// 初始化日期为昨天
// 主题设置
let currentTheme = localStorage.getItem('theme') || 'light';

// 设置主题函数
function setTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
    currentTheme = theme;
    
    // 更新标题
    document.title = `Mac屏幕使用时间统计 | ${theme.charAt(0).toUpperCase() + theme.slice(1)}`;
    
    // 更新副标题和页脚文本
    const subtitle = document.querySelector('.subtitle');
    const footerText = document.querySelector('.footer-text');
    
    if (subtitle && footerText) {
        if (theme === 'cyberpunk') {
            subtitle.textContent = 'Cyberpunk Screen Time Viewer';
            footerText.textContent = 'Cyberpunk Screen Time Viewer';
        } else if (theme === 'light') {
            subtitle.textContent = 'Screen Time Viewer';
            footerText.textContent = 'Screen Time Viewer';
        }
    }
    
    // 如果是 Light 主题，调整图表样式
    if (window.myChart) {
        if (theme === 'light') {
            window.myChart.setOption({
                backgroundColor: '#FFFFFF',
                textStyle: {
                    fontFamily: '-light-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", sans-serif'
                },
                title: {
                    textStyle: {
                        color: '#1D1D1F',
                        fontWeight: 500,
                        fontSize: 14
                    }
                },
                tooltip: {
                    backgroundColor: 'rgba(255, 255, 255, 0.9)',
                    borderColor: '#E5E5E5',
                    textStyle: {
                        color: '#1D1D1F'
                    },
                    extraCssText: 'box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1); border-radius: 6px;'
                }
            });
        } else {
            // 重置为 Cyberpunk 主题
            window.myChart.setOption({
                backgroundColor: 'transparent',
                textStyle: {
                    fontFamily: '"Inter", "Poppins", sans-serif'
                },
                title: {
                    textStyle: {
                        color: '#fff',
                        fontWeight: 600,
                        fontSize: 16
                    }
                },
                tooltip: {
                    backgroundColor: 'rgba(10, 10, 18, 0.8)',
                    borderColor: 'rgba(0, 255, 255, 0.2)',
                    textStyle: {
                        color: '#fff'
                    },
                    extraCssText: 'box-shadow: 0 0 10px rgba(0, 255, 255, 0.3); border-radius: 8px;'
                }
            });
        }
        window.myChart.resize();
    }
}

window.onload = function () {
    // 初始化 DOM 元素
    chartContainer = document.getElementById('chart-container');
    fileUploadSection = document.getElementById('file-upload-section');
    dbFileInput = document.getElementById('db-file');
    uploadButton = document.getElementById('upload-button');
    uploadStatus = document.getElementById('upload-status');
    dateInput = document.getElementById('date');
    
    // 初始化主题
    setTheme(currentTheme);
    
    // 添加主题切换事件监听器
    document.getElementById('theme-cyberpunk').addEventListener('click', () => setTheme('cyberpunk'));
    document.getElementById('theme-light').addEventListener('click', () => setTheme('light'));

    // Initialize loading state (only after DOM is fully loaded)
    setTimeout(() => {
        toggleLoading(false);
    }, 0);
    
    // 添加事件监听器
    dbFileInput.addEventListener('change', handleFileSelect);
    uploadButton.addEventListener('click', function () {
        if (uploadedFile) {
            processUploadedFile();
        } else {
            uploadStatus.innerHTML = '<p style="color: red;">请选择一个文件</p>';
        }
    });

    // 初始化日期选择器
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    // 初始化 Flatpickr 日期选择器
    flatpickrInstance = flatpickr(dateInput, {
        locale: 'zh',
        dateFormat: 'Y-m-d',
        defaultDate: yesterday,
        disableMobile: true,
        onChange: function (selectedDates, dateStr, instance) {
            if (selectedDates.length > 0) {
                updateDayOfWeek(selectedDates[0]);
                queryDatabase();
            }
        },
        disable: [] // 初始化为空数组，稍后会更新
    });

    // 更新星期几显示
    updateDayOfWeek(yesterday);

    // 初始化 SQL.js
    initializeSqlJs();

    // 显示初始提示
    uploadStatus.innerHTML = '<p style="color: blue;">请选择数据库文件并点击“处理文件”按钮</p>';

    // 显示空图表
    renderChart([]);
};

// 初始化 SQL.js
function initializeSqlJs() {
    console.log('Initializing SQL.js...');

    // 检查全局变量
    if (typeof window.initSqlJs === 'undefined') {
        console.error('SQL.js initializer not found');
        if (uploadStatus) {
            uploadStatus.innerHTML = '<p style="color: red;">SQL.js 初始化失败，请刷新页面重试</p>';
        }
        return;
    }

    // 使用正确的 CDN 路径
    window.initSqlJs({
        locateFile: file => `https://cdn.jsdelivr.net/npm/sql.js@1.8.0/dist/${file}`
    }).then(function (sql) {
        SQL = sql;
        sqlReady = true;
        console.log('SQL.js initialized successfully');

        // 如果已有文件，自动处理
        if (uploadedFile && uploadStatus) {
            processUploadedFile();
        }
    }).catch(function (err) {
        console.error('Error initializing SQL.js', err);
        if (uploadStatus) {
            uploadStatus.innerHTML = '<p style="color: red;">SQL.js 初始化失败，请刷新页面重试</p>';
        }
    });
}

// 处理文件选择
function handleFileSelect(event) {
    const file = event.target.files[0];
    if (!file) {
        uploadStatus.innerHTML = '<p style="color: red;">请选择一个文件</p>';
        return;
    }

    // 检查文件类型
    if (!file.name.endsWith('.db')) {
        uploadStatus.innerHTML = '<p style="color: red;">请选择 .db 格式的 SQLite 数据库文件</p>';
        return;
    }

    uploadedFile = file;
    uploadStatus.innerHTML = `<p>文件 "${file.name}" 已选择，点击上传按钮开始处理</p>`;
}

// 处理上传的文件
function processUploadedFile() {
    if (!sqlReady) {
        uploadStatus.innerHTML = '<p style="color: red;">SQL.js 还未准备好，请稍后再试</p>';
        return;
    }

    if (!uploadedFile) {
        uploadStatus.innerHTML = '<p style="color: red;">请选择一个文件</p>';
        return;
    }

    // 如果数据库已经加载，直接使用
    if (loadedDb) {
        queryDatabase();
        return;
    }

    uploadStatus.innerHTML = '<p>正在加载数据库文件...</p>';

    const reader = new FileReader();
    reader.onload = function (e) {
        try {
            const uInt8Array = new Uint8Array(e.target.result);
            loadedDb = new SQL.Database(uInt8Array); // 将数据库存储在全局变量中
            uploadStatus.innerHTML = '<p style="color: green;">数据库文件加载成功</p>';

            // 数据库加载成功后更新可选日期并查询当前日期的数据
            updateAvailableDates();
            queryDatabase();
        } catch (error) {
            console.error('处理数据库文件失败:', error);
            uploadStatus.innerHTML = `<p style="color: red;">处理数据库文件失败: ${error.message}</p>`;
        }
    };
    reader.onerror = function () {
        uploadStatus.innerHTML = '<p style="color: red;">读取文件失败</p>';
    };
    reader.readAsArrayBuffer(uploadedFile);
}

// 更新日期选择器中可用的日期
function updateAvailableDates() {
    if (!loadedDb) {
        return;
    }

    try {
        // 构建查询，获取所有有数据的日期
        const query = `
        SELECT DISTINCT
            date(ZOBJECT.ZSTARTDATE + ${MACOS_EPOCH_OFFSET}, 'unixepoch', 'localtime') as date
        FROM 
            ZOBJECT
        WHERE 
            ZSTREAMNAME = '/app/usage' 
            AND ZOBJECT.ZVALUESTRING IS NOT NULL
        ORDER BY 
            date
        `;

        // 执行查询
        const results = loadedDb.exec(query);

        if (results.length === 0 || results[0].values.length === 0) {
            console.log('没有找到任何日期的数据');
            uploadStatus.innerHTML = '<p style="color: orange;">数据库中没有找到任何日期的数据</p>';
            return;
        }

        // 获取所有有数据的日期
        const availableDates = results[0].values.map(row => row[0]);
        console.log('可用日期:', availableDates);

        // 创建一个函数，用于禁用没有数据的日期
        const disableUnavailableDates = (date) => {
            // 格式化日期为 YYYY-MM-DD
            const formattedDate = date.getFullYear() + '-' +
                String(date.getMonth() + 1).padStart(2, '0') + '-' +
                String(date.getDate()).padStart(2, '0');

            // 如果日期不在可用日期列表中，则禁用
            return !availableDates.includes(formattedDate);
        };

        // 更新 Flatpickr 配置
        flatpickrInstance.set('disable', [disableUnavailableDates]);

        // 如果当前选中的日期没有数据，则选择最近的有数据的日期
        const currentDate = flatpickrInstance.selectedDates[0];
        if (currentDate) {
            const formattedCurrentDate = currentDate.getFullYear() + '-' +
                String(currentDate.getMonth() + 1).padStart(2, '0') + '-' +
                String(currentDate.getDate()).padStart(2, '0');

            if (!availableDates.includes(formattedCurrentDate) && availableDates.length > 0) {
                // 选择第一个可用日期
                flatpickrInstance.setDate(availableDates[0]);
                uploadStatus.innerHTML = `<p style="color: blue;">当前日期无数据，已自动选择有数据的日期: ${availableDates[0]}</p>`;
            }
        }

        // 更新状态消息，显示可用日期数量
        if (availableDates.length > 0) {
            uploadStatus.innerHTML = `<p style="color: green;">数据库中找到 ${availableDates.length} 个日期的数据</p>`;
        }
    } catch (error) {
        console.error('更新可用日期失败:', error);
        uploadStatus.innerHTML = `<p style="color: red;">更新可用日期失败: ${error.message}</p>`;
    }
}

// 查询数据库获取当前日期的数据
function queryDatabase() {
    if (!loadedDb) {
        uploadStatus.innerHTML = '<p style="color: red;">数据库还未加载，请先点击“确认”按钮</p>';
        return;
    }

    toggleLoading(true); // Show loading

    // Add a small delay to allow the loading animation to be visible
    setTimeout(() => {
        try {
            const date = dateInput.value;
            const queryDate = flatpickrInstance.selectedDates[0] || new Date(date);
            const dayOfWeek = getChineseDayOfWeek(queryDate);
            uploadStatus.innerHTML = `<p>正在查询 ${dayOfWeek} ${date} 的数据...</p>`;

            // 构建查询
            const query = `
            SELECT 
                ZOBJECT.ZVALUESTRING as app_name,
                ZOBJECT.ZSTARTDATE as start_time,
                ZOBJECT.ZENDDATE as end_time
            FROM 
                ZOBJECT
            WHERE 
                ZSTREAMNAME = '/app/usage' 
                AND date(ZOBJECT.ZSTARTDATE + ${MACOS_EPOCH_OFFSET}, 'unixepoch', 'localtime') = '${date}'
                AND ZOBJECT.ZVALUESTRING IS NOT NULL
            ORDER BY 
                ZOBJECT.ZSTARTDATE
            `;

            // 执行查询
            const results = loadedDb.exec(query);

            if (results.length === 0 || results[0].values.length === 0) {
                const noDataDate = flatpickrInstance.selectedDates[0] || new Date(date);
                const dayOfWeek = getChineseDayOfWeek(noDataDate);
                uploadStatus.innerHTML = `<p>没有找到 ${dayOfWeek} ${date} 的数据</p>`;
                renderChart([]);
                return;
            }

            // 处理查询结果
            const data = processQueryResults(results[0]);
            renderChart(data);
            uploadStatus.innerHTML = `<p style="color: green;">数据加载成功，显示 ${data.length} 条记录</p>`;
        } catch (error) {
            console.error('查询数据库失败:', error);
            uploadStatus.innerHTML = `<p style="color: red;">查询数据库失败: ${error.message}</p>`;
        }
        // When complete, hide loading
        toggleLoading(false);
    }, 300);

}

// 合并相邻时间段
function mergeIntervals(data, appName) {
    if (data.length === 0) return [];

    // 按开始时间排序
    const sorted = [...data].sort((a, b) => new Date(a.start_time) - new Date(b.start_time));
    const merged = [];
    let current = sorted[0];

    for (let i = 1; i < sorted.length; i++) {
        const row = sorted[i];
        // 计算时间间隔（分钟）
        const gap = (new Date(row.start_time) - new Date(current.end_time)) / (1000 * 60);

        // 根据应用名称和间隔时间决定是否合并
        if (gap <= 3 || (appName === 'com.electron.lark.iron' && gap <= 10)) {
            // 合并时间段
            current.end_time = new Date(Math.max(
                new Date(current.end_time).getTime(),
                new Date(row.end_time).getTime()
            )).toISOString();
        } else {
            merged.push(current);
            current = row;
        }
    }
    merged.push(current);
    return merged;
}

// 处理查询结果
function processQueryResults(results) {
    const columns = results.columns; // ['app_name', 'start_time', 'end_time']
    const values = results.values;

    // 首先将数据转换为对象数组
    const rawData = values.map(row => {
        const item = {};
        columns.forEach((col, index) => {
            item[col] = row[index];
        });
        return item;
    });

    // 转换时间戳并过滤无效记录
    let processedData = rawData.map(item => {
        // 转换时间戳，macOS 时间戳从 2001-01-01 开始
        const startTime = new Date((item.start_time + MACOS_EPOCH_OFFSET) * 1000);
        const endTime = new Date((item.end_time + MACOS_EPOCH_OFFSET) * 1000);

        // 添加上海时区信息（简化处理，JavaScript 处理时区比较复杂）
        return {
            app_name: item.app_name,
            start_time: startTime.toISOString(),
            end_time: endTime.toISOString(),
            // 计算相对分钟和使用时长
            start_minutes: startTime.getHours() * 60 + startTime.getMinutes() + startTime.getSeconds() / 60,
            duration: (endTime - startTime) / (1000 * 60)
        };
    });

    // 过滤结束时间早于开始时间的记录
    processedData = processedData.filter(item => new Date(item.end_time) > new Date(item.start_time));

    // 按应用名称分组
    const appGroups = {};
    processedData.forEach(item => {
        if (!appGroups[item.app_name]) {
            appGroups[item.app_name] = [];
        }
        appGroups[item.app_name].push(item);
    });

    // 合并相邻时间段
    let mergedData = [];
    Object.entries(appGroups).forEach(([appName, group]) => {
        const merged = mergeIntervals(group, appName);
        mergedData = mergedData.concat(merged);
    });

    // 重新计算相对分钟和使用时长（合并后需要更新）
    mergedData = mergedData.map(item => {
        const startTime = new Date(item.start_time);
        const endTime = new Date(item.end_time);
        return {
            ...item,
            start_minutes: startTime.getHours() * 60 + startTime.getMinutes() + startTime.getSeconds() / 60,
            duration: (endTime - startTime) / (1000 * 60)
        };
    });

    // 计算每个应用的总使用时长
    const appUsage = {};
    mergedData.forEach(item => {
        if (!appUsage[item.app_name]) {
            appUsage[item.app_name] = 0;
        }
        appUsage[item.app_name] += item.duration;
    });

    // 过滤总时长≥2分钟的应用
    const filteredApps = Object.entries(appUsage)
        .filter(([_, duration]) => duration >= 2)
        .sort((a, b) => b[1] - a[1]) // 按总使用时长降序排序
        .map(([appName]) => appName);

    // 过滤数据集
    let filteredData = mergedData.filter(item => filteredApps.includes(item.app_name));

    // 按总使用时长排序
    const appOrder = {};
    filteredApps.forEach((app, index) => {
        appOrder[app] = index;
    });

    filteredData = filteredData.map(item => ({
        ...item,
        y: appOrder[item.app_name],
        app_name: getAppDisplayName(item.app_name) // 转换为显示名称
    }));

    // 排序
    filteredData.sort((a, b) => a.y - b.y);

    return filteredData;
}

// 将应用包名映射为中文显示名称
function getAppDisplayName(appName) {
    const nameMapping = {
        'com.light.finder': 'Finder',
        'com.tencent.xinWeChat': '微信',
        'com.googlecode.iterm2': 'Iterm2',
        'com.electron.lark.iron': '飞书会议',
        'com.jetbrains.goland': 'Goland',
        'com.electron.lark': '飞书',
        'com.google.Chrome': 'Chrome',
        'cn.trae.app': 'Trae',
        'com.exafunction.windsurf': 'Windsurf',
        'org.python.python': 'Python',
        'com.microsoft.VSCode': 'VSCode',
        'com.tencent.QQMusicMac': 'QQ音乐',
        'com.light.systempreferences': '系统设置',
    };

    // 如果在映射中找到则直接返回
    if (appName in nameMapping) {
        return nameMapping[appName];
    }

    // 其他情况返回原始名称
    return appName;
}

// 处理数据 - 检查数据库状态并执行相应操作
function fetchData() {
    // 如果数据库已经加载，直接查询当前日期
    if (loadedDb) {
        queryDatabase();
        return;
    }

    // 如果有上传的文件但数据库还没加载，则处理文件
    if (uploadedFile) {
        if (sqlReady) {
            processUploadedFile();
        } else {
            uploadStatus.innerHTML = '<p style="color: orange;">SQL.js 正在加载中，请稍后...</p>';
        }
    } else {
        // 如果没有上传文件，提示用户选择文件
        uploadStatus.innerHTML = '<p style="color: blue;">请选择数据库文件并点击“确认”按钮</p>';
        renderChart([]); // 显示空图表
    }
}

// 渲染甘特图
function renderChart(data) {
    // 初始化ECharts实例并防止内存泄漏
    const existingChart = echarts.getInstanceByDom(chartContainer);
    if (existingChart) {
        existingChart.dispose();
    }

    chartContainer.innerHTML = ''; // 清空旧内容
    if (data.length === 0) {
        chartContainer.innerHTML = '<p>未查询到该日期的使用数据</p>';
        return;
    }
    const newChart = echarts.init(chartContainer);
    
    // Store chart reference globally for theme switching
    window.myChart = newChart;

    // 计算每个应用的总使用时长
    const appUsageMap = {};
    data.forEach(item => {
        const startTime = new Date(item.start_time);
        const endTime = new Date(item.end_time);

        if (isNaN(startTime) || isNaN(endTime)) {
            return;
        }

        const durationMinutes = Math.round((endTime - startTime) / (1000 * 60));

        if (!appUsageMap[item.app_name]) {
            appUsageMap[item.app_name] = 0;
        }
        appUsageMap[item.app_name] += durationMinutes;
    });

    // 提取唯一分类并按使用时长排序（从高到低）
    const categories = [...new Set(data.map(item => item.app_name))]
        .sort((a, b) => appUsageMap[b] - appUsageMap[a]);

    // 为不同应用分配不同颜色
    const colorMap = {
        '飞书': '#00FFFF',      // Cyan
        '飞书会议': '#00FFFF',  // Cyan
        'Chrome': '#0000FF',   // Blue
        '微信': '#00FF00',      // Green
        'Goland': '#FF00FF'    // Magenta
    };
    
    // Light风格颜色 - 更高级的淡色调
    const appleColorMap = {
        '飞书': '#5AC8FA',      // 淡蓝色
        'Chrome': '#AF52DE',   // 淡紫色
        '微信': '#34C759',      // 淡绿色
        '飞书会议': '#FF9500',  // 淡橙色
        'Goland': '#2E7CF6'    // 蓝色
    };
    
    // Generate dynamic colors for other apps
    const generateNeonColor = (index) => {
        const hue = (index * 60) % 360;
        return `hsl(${hue}, 100%, 70%)`;
    };
    
    // Generate Light-style colors for other apps - 更高级的淡色调
    const generateLightColor = (index) => {
        // 高级淡色调色板
        const appleColors = [
            '#5AC8FA', '#AF52DE', '#34C759', '#FF9500', '#2E7CF6', 
            '#FF3B30', '#64D2FF', '#BF5AF2', '#30D158', '#FFD60A', '#66D4CF'
        ];
        return appleColors[index % appleColors.length];
    };

    // 获取当天的日期部分
    const dateStr = dateInput.value;
    const baseDate = flatpickrInstance.selectedDates[0] || new Date(dateStr);

    // 计算数据中的最早开始时间和最晚结束时间
    let earliestStart = null;
    let latestEnd = null;

    data.forEach(item => {
        const startTime = new Date(item.start_time);
        const endTime = new Date(item.end_time);

        if (isNaN(startTime) || isNaN(endTime)) {
            return;
        }

        if (earliestStart === null || startTime < earliestStart) {
            earliestStart = startTime;
        }

        if (latestEnd === null || endTime > latestEnd) {
            latestEnd = endTime;
        }
    });

    // 如果没有有效数据，使用默认范围
    if (earliestStart === null || latestEnd === null) {
        earliestStart = new Date(baseDate.setHours(10, 0, 0, 0));
        latestEnd = new Date(baseDate.setHours(21, 0, 0, 0));
    } else {
        // 重置baseDate，因为上面的setHours可能已经修改了它
        baseDate.setHours(0, 0, 0, 0);
    }

    // 添加30分钟的缓冲区
    const bufferMs = 30 * 60 * 1000; // 30分钟，单位毫秒
    earliestStart = new Date(earliestStart.getTime() - bufferMs);
    latestEnd = new Date(latestEnd.getTime() + bufferMs);

    // 处理数据
    const seriesData = [];
    data.forEach(item => {
        const startTime = new Date(item.start_time);
        const endTime = new Date(item.end_time);

        if (isNaN(startTime) || isNaN(endTime)) {
            console.error('无效的时间戳:', item);
            return;
        }

        // 计算分钟差
        const durationMinutes = Math.round((endTime - startTime) / (1000 * 60));

        // Get current theme
        const currentTheme = document.documentElement.getAttribute('data-theme') || 'cyberpunk';
        
        // When setting item style in seriesData
        seriesData.push({
            name: item.app_name,
            value: [
                item.app_name,
                startTime,
                endTime,
                `${durationMinutes}m`
            ],
            itemStyle: currentTheme === 'light' ? {
                color: appleColorMap[item.app_name] || generateLightColor(categories.indexOf(item.app_name)),
                borderColor: 'rgba(0, 0, 0, 0.05)',
                borderWidth: 0,
                borderRadius: 4,
                shadowBlur: 0,
                opacity: 0.9
            } : {
                color: colorMap[item.app_name] || generateNeonColor(categories.indexOf(item.app_name)),
                borderColor: 'rgba(255, 255, 255, 0.2)',
                borderWidth: 1,
                shadowBlur: 5,
                shadowColor: colorMap[item.app_name] || generateNeonColor(categories.indexOf(item.app_name))
            }
        });
    });

    // 获取当前主题
    const currentTheme = document.documentElement.getAttribute('data-theme') || 'cyberpunk';
    
    // 构建图表配置
    const option = {
        tooltip: {
            formatter: function (params) {
                const labelColor = currentTheme === 'light' ? params.color : params.color;
                const labelStyle = currentTheme === 'light' 
                    ? `font-weight: 500; color: #1D1D1F; margin-bottom: 5px; font-size: 13px;` 
                    : `font-weight: bold; color: ${params.color}; margin-bottom: 5px; font-size: 14px;`;
                const labelTextColor = currentTheme === 'light' ? '#86868B' : '#aaa';
                
                return `<div style="padding: 8px;">
                    <div style="${labelStyle}">${params.name}</div>
                    <div style="display: flex; justify-content: space-between; margin-bottom: 3px;">
                        <span style="color: ${labelTextColor};">开始:</span>
                        <span>${new Date(params.value[1]).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                    <div style="display: flex; justify-content: space-between; margin-bottom: 3px;">
                        <span style="color: ${labelTextColor};">结束:</span>
                        <span>${new Date(params.value[2]).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                    <div style="display: flex; justify-content: space-between; font-weight: ${currentTheme === 'light' ? '500' : 'bold'};">
                        <span style="color: ${labelTextColor};">时长:</span>
                        <span>${params.value[3]}</span>
                    </div>
                </div>`;
            },
            backgroundColor: currentTheme === 'light' ? 'rgba(255, 255, 255, 0.95)' : 'rgba(10, 10, 18, 0.8)',
            borderColor: currentTheme === 'light' ? '#E5E5E5' : 'rgba(0, 255, 255, 0.3)',
            borderWidth: 1,
            textStyle: {
                color: currentTheme === 'light' ? '#1D1D1F' : '#fff',
                fontFamily: currentTheme === 'light' ? '-light-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", sans-serif' : 'Inter, Poppins, sans-serif'
            },
            extraCssText: currentTheme === 'light' 
                ? 'backdrop-filter: blur(10px); border-radius: 6px; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);' 
                : 'backdrop-filter: blur(5px); border-radius: 8px; box-shadow: 0 0 10px rgba(0, 255, 255, 0.3);'
        },
        grid: {
            height: categories.length * 40,
            containLabel: true,
            left: '3%',
            right: '3%'
        },
        // Enhanced axis styling
        xAxis: {
            type: 'time',
            min: earliestStart.getTime(),
            max: latestEnd.getTime(),
            axisLabel: {
                formatter: function (value) {
                    const date = new Date(value);
                    return date.getHours() + ':' + (date.getMinutes() < 10 ? '00' : '30');
                },
                interval: 30 * 60 * 1000, // 30分钟间隔
                textStyle: {
                    color: currentTheme === 'light' ? '#86868B' : 'rgba(0, 255, 255, 0.8)',
                    fontFamily: currentTheme === 'light' ? '-light-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", sans-serif' : 'Inter, Poppins, sans-serif',
                    fontSize: currentTheme === 'light' ? 11 : 12
                }
            },
            splitLine: {
                show: true,
                lineStyle: {
                    type: currentTheme === 'light' ? 'solid' : 'dashed',
                    color: currentTheme === 'light' ? 'rgba(0, 0, 0, 0.05)' : 'rgba(0, 255, 255, 0.15)'
                }
            },
            axisLine: {
                lineStyle: {
                    color: currentTheme === 'light' ? '#E5E5E5' : 'rgba(0, 255, 255, 0.3)'
                }
            }
        },
        yAxis: {
            type: 'category',
            data: categories,
            axisLabel: {
                formatter: function (value) {
                    // 显示应用名称和总使用时长
                    const totalMinutes = appUsageMap[value];
                    const hours = Math.floor(totalMinutes / 60);
                    const minutes = totalMinutes % 60;
                    const timeStr = hours > 0 ?
                        `${hours}h${minutes > 0 ? ` ${minutes}m` : ''}` :
                        `${minutes}m`;
                    // 使用HTML标签加粗应用名称
                    return `{bold|${value}} {time|(${timeStr})}`;
                },
                rich: {
                    bold: {
                        fontWeight: currentTheme === 'light' ? '500' : 'bold',
                        fontSize: currentTheme === 'light' ? 13 : 14,
                        fontFamily: currentTheme === 'light' ? '-light-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", sans-serif' : 'Inter, Poppins, sans-serif',
                        color: currentTheme === 'light' ? '#1D1D1F' : '#fff'
                    },
                    time: {
                        fontSize: currentTheme === 'light' ? 11 : 12,
                        fontFamily: currentTheme === 'light' ? '-light-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", sans-serif' : 'Inter, Poppins, sans-serif',
                        color: currentTheme === 'light' ? '#86868B' : 'rgba(255, 255, 255, 0.7)'
                    }
                }
            },
            axisLine: {
                lineStyle: {
                    color: currentTheme === 'light' ? '#E5E5E5' : 'rgba(0, 255, 255, 0.3)'
                }
            },
            splitLine: {
                show: true,
                lineStyle: {
                    type: currentTheme === 'light' ? 'solid' : 'dashed',
                    color: currentTheme === 'light' ? 'rgba(0, 0, 0, 0.05)' : 'rgba(0, 255, 255, 0.1)'
                }
            },
            inverse: true
        },
        // Add animation
        animation: true,
        animationDuration: 1000,
        animationEasing: 'cubicOut',
        animationDelay: function (idx) {
            return idx * 50;
        },
        series: [{
            type: 'custom',
            renderItem: function (params, api) {
                const categoryIndex = api.value(0);
                const start = api.coord([api.value(1), api.value(0)]);
                const end = api.coord([api.value(2), api.value(0)]);
                const height = api.size([0, 1])[1] * 0.6;

                const rectShape = {
                    x: start[0],
                    y: start[1] - height / 2,
                    width: Math.max(end[0] - start[0], 2), // 确保至少有2px宽度
                    height: height
                };

                // 计算文本是否能放入矩形
                const durationText = api.value(3);

                // 将分钟数转换为小时和分钟格式（如果超过60分钟）
                let formattedDuration = durationText;
                if (durationText.endsWith('m')) {
                    const minutes = parseInt(durationText.replace('m', ''));
                    if (minutes > 60) {
                        const hours = Math.floor(minutes / 60);
                        const remainingMinutes = minutes % 60;
                        formattedDuration = hours + 'h' + (remainingMinutes > 0 ? ' ' + remainingMinutes + 'm' : '');
                    }
                }

                const rectWidth = rectShape.width;
                const fontSize = 12;
                const textWidth = formattedDuration.length * fontSize * 0.6;

                // 只有当矩形宽度足够大时才显示文本
                const showLabel = rectWidth > textWidth + 2;

                return {
                    type: 'group',
                    children: [
                        {
                            type: 'rect',
                            shape: rectShape,
                            style: api.style({
                                fill: api.visual('color')
                            })
                        },
                        showLabel ? {
                            type: 'text',
                            style: {
                                text: formattedDuration,
                                textFont: api.font({ 
                                    fontSize: fontSize,
                                    fontFamily: currentTheme === 'light' ? '-light-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", sans-serif' : 'Inter, Poppins, sans-serif'
                                }),
                                textFill: currentTheme === 'light' ? '#FFFFFF' : '#fff',
                                textAlign: 'center',
                                textVerticalAlign: 'middle'
                            },
                            position: [
                                start[0] + rectShape.width / 2,
                                start[1]
                            ]
                        } : null
                    ].filter(Boolean)
                };
            },
            dimensions: [
                { name: 'category', type: 'ordinal' },
                { name: 'start', type: 'time' },
                { name: 'end', type: 'time' },
                { name: 'duration', type: 'ordinal' }
            ],
            encode: {
                x: [1, 2],
                y: 0
            },
            data: seriesData
        }]
    };

    // 计算屏幕使用统计信息
    const statsInfo = calculateScreenTimeStats(data, earliestStart, latestEnd);

    // 将统计信息添加到图表中
    const dayOfWeek = getChineseDayOfWeek(baseDate);
    option.title = {
        text: `${dayOfWeek} ${dateStr} 屏幕使用总时长: ${statsInfo.totalUsageFormatted}`,
        left: 'center',
        top: 0,
        textStyle: {
            fontSize: 16
        }
    };

    // 如果有显著的空闲时段，添加空闲时段背景
    if (statsInfo.significantIdlePeriods.length > 0) {
        // 为每个空闲时段创建一个空闲数据系列
        statsInfo.significantIdlePeriods.forEach((period, index) => {
            // 计算时间段的时长
            const durationMinutes = Math.round((period.end - period.start) / (1000 * 60));

            // 准备要显示的文本，根据不同的位置显示不同的信息
            let displayText;

            if (index === 0) {
                // 第一个空闲时段显示结束时间
                const endTime = new Date(period.end);
                displayText = endTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            } else if (index === statsInfo.significantIdlePeriods.length - 1) {
                // 最后一个空闲时段显示开始时间
                const startTime = new Date(period.start);
                displayText = startTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            } else {
                // 其他空闲时段显示时长，格式与应用使用时段保持一致
                if (durationMinutes >= 60) {
                    const hours = Math.floor(durationMinutes / 60);
                    const minutes = durationMinutes % 60;
                    displayText = hours + 'h' + (minutes > 0 ? ' ' + minutes + 'm' : '');
                } else {
                    displayText = durationMinutes + 'm';
                }
            }

            // 创建一个空闲区域数据系列
            const idleAreaSeries = {
                name: `空闲${index + 1}`,
                type: 'custom',
                renderItem: function (params, api) {
                    const coordSys = params.coordSys;
                    const width = api.size([0, 0])[0];
                    const height = coordSys.height;

                    // Calculate idle area position
                    const startPoint = api.coord([period.start, 0]);
                    const endPoint = api.coord([period.end, 0]);

                    if (!startPoint || !endPoint) {
                        return {
                            type: 'group',
                            children: []
                        };
                    }

                    // Create idle area rectangle with cyberpunk style
                    const rectShape = {
                        x: startPoint[0],
                        y: coordSys.y,
                        width: endPoint[0] - startPoint[0],
                        height: height
                    };

                    return {
                        type: 'group',
                        children: [
                            {
                                type: 'rect',
                                shape: rectShape,
                                style: {
                                    fill: 'rgba(100, 100, 255, 0.1)',
                                    stroke: 'rgba(100, 100, 255, 0.3)',
                                    lineWidth: 1
                                },
                                silent: true
                            },
                            {
                                type: 'text',
                                style: {
                                    text: displayText,
                                    textAlign: 'center',
                                    textVerticalAlign: 'middle',
                                    fontSize: 12,
                                    fill: 'rgba(100, 100, 255, 0.8)',
                                    fontFamily: 'Inter, sans-serif'
                                },
                                position: [
                                    startPoint[0] + (endPoint[0] - startPoint[0]) / 2,
                                    coordSys.y - 15
                                ],
                                silent: true
                            }
                        ]
                    };
                },
                data: [0],
                z: -1
            };

            // 将该系列添加到图表中
            option.series.push(idleAreaSeries);
        });

        // Update idle tooltip styling
        const idleTooltip = document.createElement('div');
        idleTooltip.className = 'idle-tooltip';
        idleTooltip.innerHTML = `<p><span class="idle-marker"></span> 空闲时段 (${statsInfo.significantIdlePeriods.length}个, 15分钟以上)</p>`;
        chartContainer.appendChild(idleTooltip);

    }

    // 设置并渲染图表
    newChart.setOption(option);

    // 响应窗口大小变化
    window.addEventListener('resize', function () {
        newChart.resize();
    });
}

// 计算屏幕使用统计信息
function calculateScreenTimeStats(data, earliestStart, latestEnd) {
    // 按时间排序所有时间段
    const timeRanges = data.map(item => {
        return {
            start: new Date(item.start_time).getTime(),
            end: new Date(item.end_time).getTime(),
            app: item.app_name
        };
    }).sort((a, b) => a.start - b.start);

    // 合并重叠的时间段
    const mergedRanges = [];
    if (timeRanges.length > 0) {
        let currentRange = { ...timeRanges[0] };

        for (let i = 1; i < timeRanges.length; i++) {
            const range = timeRanges[i];

            // 如果当前时间段与合并中的时间段重叠
            if (range.start <= currentRange.end) {
                // 更新结束时间为较晚的时间
                currentRange.end = Math.max(currentRange.end, range.end);
            } else {
                // 不重叠，保存当前合并的时间段并开始新的合并
                mergedRanges.push(currentRange);
                currentRange = { ...range };
            }
        }

        // 添加最后一个合并的时间段
        mergedRanges.push(currentRange);
    }

    // 计算总使用时长（毫秒）
    const totalUsageMs = mergedRanges.reduce((total, range) => {
        return total + (range.end - range.start);
    }, 0);

    // 转换为小时和分钟
    const totalMinutes = Math.round(totalUsageMs / (1000 * 60));
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    const totalUsageFormatted = hours > 0 ?
        `${hours}小时${minutes > 0 ? ` ${minutes}分钟` : ''}` :
        `${minutes}分钟`;

    // 计算空闲时段
    const idlePeriods = [];
    const dayStart = earliestStart.getTime();
    const dayEnd = latestEnd.getTime();

    // 如果没有使用记录，整天都是空闲
    if (mergedRanges.length === 0) {
        idlePeriods.push({
            start: dayStart,
            end: dayEnd
        });
    } else {
        // 检查一天开始到第一个使用时段之间是否有空闲
        if (mergedRanges[0].start > dayStart) {
            idlePeriods.push({
                start: dayStart,
                end: mergedRanges[0].start
            });
        }

        // 检查使用时段之间的空闲
        for (let i = 0; i < mergedRanges.length - 1; i++) {
            if (mergedRanges[i + 1].start > mergedRanges[i].end) {
                idlePeriods.push({
                    start: mergedRanges[i].end,
                    end: mergedRanges[i + 1].start
                });
            }
        }

        // 检查最后一个使用时段到一天结束之间是否有空闲
        const lastRange = mergedRanges[mergedRanges.length - 1];
        if (lastRange.end < dayEnd) {
            idlePeriods.push({
                start: lastRange.end,
                end: dayEnd
            });
        }
    }

    // 过滤掉太短的空闲时段（小于15分钟）
    const significantIdlePeriods = idlePeriods.filter(period => {
        return (period.end - period.start) >= 15 * 60 * 1000; // 15分钟
    });

    return {
        totalUsageMs,
        totalMinutes,
        totalUsageFormatted,
        mergedRanges,
        significantIdlePeriods
    };
}

// Add this function to show/hide loading overlay
function toggleLoading(show) {
    const loadingOverlay = document.querySelector('.loading-overlay');
    if (!loadingOverlay) return; // Safely handle if the element doesn't exist yet
    
    if (show) {
        loadingOverlay.classList.add('active');
    } else {
        loadingOverlay.classList.remove('active');
    }
}
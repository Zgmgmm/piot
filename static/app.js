// 全局变量声明
let dateInput;
let chartContainer;
let fileUploadSection;
let dbFileInput;
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
    const currentDate = new Date(dateInput.value);
    currentDate.setDate(currentDate.getDate() + days);
    const yyyy = currentDate.getFullYear();
    const mm = String(currentDate.getMonth() + 1).padStart(2, '0');
    const dd = String(currentDate.getDate()).padStart(2, '0');
    dateInput.value = `${yyyy}-${mm}-${dd}`;
    
    // 如果数据库已加载，直接查询新日期
    if (loadedDb) {
        queryDatabase();
    } else {
        uploadStatus.innerHTML = '<p style="color: blue;">请选择数据库文件并点击“确认”按钮</p>';
    }
}

// 导航到今天的函数
function navigateToday() {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    dateInput.value = `${yyyy}-${mm}-${dd}`;
    
    // 如果数据库已加载，直接查询今天的数据
    if (loadedDb) {
        queryDatabase();
    } else {
        uploadStatus.innerHTML = '<p style="color: blue;">请选择数据库文件并点击“确认”按钮</p>';
    }
}

// 初始化日期为昨天
window.onload = function () {
    // 初始化 DOM 元素
    dateInput = document.getElementById('date');
    chartContainer = document.getElementById('chart-container');
    fileUploadSection = document.getElementById('file-upload-section');
    dbFileInput = document.getElementById('db-file');
    uploadButton = document.getElementById('upload-button');
    uploadStatus = document.getElementById('upload-status');
    
    // 设置日期
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yyyy = yesterday.getFullYear();
    const mm = String(yesterday.getMonth() + 1).padStart(2, '0');
    const dd = String(yesterday.getDate()).padStart(2, '0');
    dateInput.value = `${yyyy}-${mm}-${dd}`;
    
    // 初始化 SQL.js
    initializeSqlJs();
    
    // 添加文件上传事件监听
    dbFileInput.addEventListener('change', handleFileSelect);
    uploadButton.addEventListener('click', function() {
        if (uploadedFile) {
            processUploadedFile();
        } else {
            uploadStatus.innerHTML = '<p style="color: red;">请选择一个文件</p>';
        }
    });
    
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
    }).then(function(sql) {
        SQL = sql;
        sqlReady = true;
        console.log('SQL.js initialized successfully');
        
        // 如果已有文件，自动处理
        if (uploadedFile && uploadStatus) {
            processUploadedFile();
        }
    }).catch(function(err) {
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
    reader.onload = function(e) {
        try {
            const uInt8Array = new Uint8Array(e.target.result);
            loadedDb = new SQL.Database(uInt8Array); // 将数据库存储在全局变量中
            uploadStatus.innerHTML = '<p style="color: green;">数据库文件加载成功</p>';
            
            // 数据库加载成功后查询当前日期的数据
            queryDatabase();
        } catch (error) {
            console.error('处理数据库文件失败:', error);
            uploadStatus.innerHTML = `<p style="color: red;">处理数据库文件失败: ${error.message}</p>`;
        }
    };
    reader.onerror = function() {
        uploadStatus.innerHTML = '<p style="color: red;">读取文件失败</p>';
    };
    reader.readAsArrayBuffer(uploadedFile);
}

// 查询数据库获取当前日期的数据
function queryDatabase() {
    if (!loadedDb) {
        uploadStatus.innerHTML = '<p style="color: red;">数据库还未加载，请先点击“确认”按钮</p>';
        return;
    }
    
    try {
        const date = dateInput.value;
        uploadStatus.innerHTML = `<p>正在查询 ${date} 的数据...</p>`;
        
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
            uploadStatus.innerHTML = `<p>没有找到 ${date} 的数据</p>`;
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
}

// 处理查询结果
function processQueryResults(results) {
    const columns = results.columns; // ['app_name', 'start_time', 'end_time']
    const values = results.values;
    
    // 处理数据
    const processedData = [];
    const appUsage = {};
    
    // 首先将数据转换为对象数组
    const rawData = values.map(row => {
        const item = {};
        columns.forEach((col, index) => {
            item[col] = row[index];
        });
        return item;
    });
    
    // 处理时间戳和应用名称
    rawData.forEach(item => {
        // 转换时间戳，macOS 时间戳从 2001-01-01 开始
        const startTime = new Date((item.start_time + MACOS_EPOCH_OFFSET) * 1000);
        const endTime = new Date((item.end_time + MACOS_EPOCH_OFFSET) * 1000);
        
        // 过滤结束时间早于开始时间的记录
        if (endTime <= startTime) {
            return;
        }
        
        // 计算使用时长（分钟）
        const durationMinutes = (endTime - startTime) / (1000 * 60);
        
        // 累计应用使用时长
        if (!appUsage[item.app_name]) {
            appUsage[item.app_name] = 0;
        }
        appUsage[item.app_name] += durationMinutes;
        
        // 添加到处理后的数据中
        processedData.push({
            app_name: getAppDisplayName(item.app_name),
            start_time: startTime.toISOString(),
            end_time: endTime.toISOString()
        });
    });
    
    // 过滤总时长≥ 2 分钟的应用
    const filteredData = processedData.filter(item => {
        const appName = item.app_name;
        const originalAppName = rawData.find(raw => getAppDisplayName(raw.app_name) === appName)?.app_name;
        return originalAppName && appUsage[originalAppName] >= 2;
    });
    
    return filteredData;
}

// 将应用包名映射为中文显示名称
function getAppDisplayName(appName) {
    const nameMapping = {
        'com.apple.finder': 'Finder',
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
        'com.apple.systempreferences': '系统设置',
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
        '飞书': '#3A75C4',      // 蓝色
        'Chrome': '#4CAF50',   // 绿色
        '微信': '#9E9E9E',      // 灰色
        '飞书会议': '#8D6E63',  // 棕色
        'Goland': '#03A9F4'    // 浅蓝色
    };

    // 获取当天的日期部分
    const dateStr = dateInput.value;
    const baseDate = new Date(dateStr);
    
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
        
        seriesData.push({
            name: item.app_name,
            value: [
                item.app_name,
                startTime,
                endTime,
                `${durationMinutes}m`  // 显示分钟数
            ],
            itemStyle: {
                color: colorMap[item.app_name] || `hsl(${(categories.indexOf(item.app_name) * 60) % 360}, 70%, 60%)`
            }
        });
    });

    // 构建图表配置
    const option = {
        tooltip: {
            formatter: function(params) {
                return `${params.name}<br/>` +
                       `开始: ${new Date(params.value[1]).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}<br/>` +
                       `结束: ${new Date(params.value[2]).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}<br/>` +
                       `时长: ${params.value[3]}`;
            }
        },
        grid: {
            height: categories.length * 40,
            containLabel: true,
            left: '3%',
            right: '3%'
        },
        xAxis: {
            type: 'time',
            min: earliestStart.getTime(),
            max: latestEnd.getTime(),
            axisLabel: {
                formatter: function(value) {
                    const date = new Date(value);
                    return date.getHours() + ':' + (date.getMinutes() < 10 ? '00' : '30');
                },
                interval: 30 * 60 * 1000 // 30分钟间隔
            },
            splitLine: {
                show: true,
                lineStyle: {
                    type: 'dashed',
                    color: '#ddd'
                }
            }
        },
        yAxis: {
            type: 'category',
            data: categories,
            axisLabel: {
                formatter: function(value) {
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
                        fontWeight: 'bold',
                        fontSize: 14,
                        fontFamily: 'PingFang SC, Microsoft YaHei, sans-serif'
                    },
                    time: {
                        fontSize: 12,
                        fontFamily: 'PingFang SC, Microsoft YaHei, sans-serif',
                        color: '#666'
                    }
                }
            },
            inverse: true
        },
        series: [{
            type: 'custom',
            renderItem: function(params, api) {
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
                                textFont: api.font({fontSize: fontSize}),
                                textFill: '#fff',
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
                {name: 'category', type: 'ordinal'},
                {name: 'start', type: 'time'},
                {name: 'end', type: 'time'},
                {name: 'duration', type: 'ordinal'}
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
    option.title = {
        text: `屏幕使用总时长: ${statsInfo.totalUsageFormatted}`,
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
                displayText = endTime.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
            } else if (index === statsInfo.significantIdlePeriods.length - 1) {
                // 最后一个空闲时段显示开始时间
                const startTime = new Date(period.start);
                displayText = startTime.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
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
                renderItem: function(params, api) {
                    const coordSys = params.coordSys;
                    const width = api.size([0, 0])[0];
                    const height = coordSys.height;
                    
                    // 计算空闲区域的位置
                    const startPoint = api.coord([period.start, 0]);
                    const endPoint = api.coord([period.end, 0]);
                    
                    if (!startPoint || !endPoint) {
                        return {
                            type: 'group',
                            children: []
                        };
                    }
                    
                    // 创建空闲区域矩形
                    const rectShape = {
                        x: startPoint[0],
                        y: coordSys.y,
                        width: endPoint[0] - startPoint[0],
                        height: height
                    };
                    
                    // 创建文本的位置（在空闲区域的上方外部）
                    const textPosition = [
                        startPoint[0] + (endPoint[0] - startPoint[0]) / 2,
                        coordSys.y - 15  // 将文本位置移到图表区域上方
                    ];
                    
                    return {
                        type: 'group',
                        children: [
                            {
                                type: 'rect',
                                shape: rectShape,
                                style: {
                                    fill: 'rgba(220, 220, 220, 0.4)',
                                    stroke: 'none'
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
                                    fill: '#666'
                                },
                                position: textPosition,
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
        
        // 添加提示信息
        const idleTooltip = document.createElement('div');
        idleTooltip.className = 'idle-tooltip';
        idleTooltip.innerHTML = `<p><span class="idle-marker"></span> 空闲时段 (${statsInfo.significantIdlePeriods.length}个, 15分钟以上)</p>`;
        chartContainer.appendChild(idleTooltip);
    }
    
    // 设置并渲染图表
    newChart.setOption(option);
    
    // 响应窗口大小变化
    window.addEventListener('resize', function() {
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
        let currentRange = {...timeRanges[0]};
        
        for (let i = 1; i < timeRanges.length; i++) {
            const range = timeRanges[i];
            
            // 如果当前时间段与合并中的时间段重叠
            if (range.start <= currentRange.end) {
                // 更新结束时间为较晚的时间
                currentRange.end = Math.max(currentRange.end, range.end);
            } else {
                // 不重叠，保存当前合并的时间段并开始新的合并
                mergedRanges.push(currentRange);
                currentRange = {...range};
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
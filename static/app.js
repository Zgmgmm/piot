// 获取元素
const dateInput = document.getElementById('date');
const chartContainer = document.getElementById('chart-container');

// 日期导航函数
function navigateDate(days) {
    const currentDate = new Date(dateInput.value);
    currentDate.setDate(currentDate.getDate() + days);
    const yyyy = currentDate.getFullYear();
    const mm = String(currentDate.getMonth() + 1).padStart(2, '0');
    const dd = String(currentDate.getDate()).padStart(2, '0');
    dateInput.value = `${yyyy}-${mm}-${dd}`;
    fetchData();
}

// 初始化日期为昨天
window.onload = function () {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yyyy = yesterday.getFullYear();
    const mm = String(yesterday.getMonth() + 1).padStart(2, '0');
    const dd = String(yesterday.getDate()).padStart(2, '0');
    dateInput.value = `${yyyy}-${mm}-${dd}`;
    fetchData();
};

// 获取数据并渲染
function fetchData() {
    const date = dateInput.value;
    fetch(`/api/data?date=${date}`)
        .then(response => response.json())
        .then(data => renderChart(data))
        .catch(error => console.error('获取数据失败:', error));
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

    // 设置并渲染图表
    newChart.setOption(option);
    
    // 响应窗口大小变化
    window.addEventListener('resize', function() {
        newChart.resize();
    });
}
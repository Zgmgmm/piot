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

    // 计算屏幕使用统计信息
    const statsInfo = calculateScreenTimeStats(data, earliestStart, latestEnd);
    
    // 将统计信息添加到图表中
    option.title = {
        text: `屏幕使用统计 (总时长: ${statsInfo.totalUsageFormatted})`,
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
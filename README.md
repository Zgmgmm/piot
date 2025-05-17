# Screen Time 数据分析工具

## 项目概述
本项目是一个用于分析Screen Time数据的Python工具...主要功能包括：
- pyplot
  - 从数据库中提取应用使用数据
  - 计算每个应用的使用时长
  - 绘制各应用使用时长的柱状图
- ECharts
  - 绘制应用使用情况的甘特图（按使用时长排序）
  - 展示每个应用的使用总时长
  - 自动调整时间轴范围以适应实际使用时间

## 注意事项
- - 数据库查询日期默认为昨天，如需修改日期，可通过命令行参数指定，格式为`YYYY-MM-DD`。示例：`python main.py 2025-05-02`。
  - 确保系统支持`Songti SC`或`PingFang SC`字体，以避免中文显示问题
  - 时间合并阈值为3分钟，相邻间隔小于该值的使用记录会被合并

## 依赖安装
本项目依赖以下Python库：
```plaintext
matplotlib
pandas
pytz
```
你可以使用以下命令安装这些依赖：
```bash
pip install matplotlib pandas pytz
```

## 运行方法
1. 确保`knowledgeC.cp.db`数据库文件存在于项目根目录。
2. 运行`main.py`文件：
```bash
python main.py
```
3. 运行成功后，会在控制台输出每个应用的使用时长，并生成`app_usage_bar_chart.png`和`screen_time_gantt.png`两个可视化图表文件。

## 文件说明
- `main.py`：主程序文件，包含数据提取、处理和可视化的主要逻辑。
- `knowledgeC.cp.db`：Screen Time 数据库文件，存储应用使用数据。
- `static/app.js`：前端JavaScript文件，负责数据可视化和交互。
- `app_usage_bar_chart.png`：各应用使用时长的柱状图。
- `screen_time_gantt.png`：应用使用情况的甘特图。

## 注意事项
- 数据库查询日期可通过命令行参数指定，格式为`YYYY-MM-DD`。示例：`python main.py 2025-05-02`，默认为昨天。
- 确保系统支持`Songti SC`或`PingFang SC`字体，以避免中文显示问题
- 时间合并阈值为5分钟，相邻间隔小于该值的使用记录会被合并

## 可视化特性
- 应用按总使用时长排序显示（使用时间最长的应用显示在顶部）
- 每个应用名称旁显示其总使用时长（小时和分钟）
- 时间轴范围自动调整，基于当天最早和最晚的应用使用时间，并在两端各添加30分钟缓冲区
- 鼠标悬停在使用记录上可查看详细的开始时间、结束时间和使用时长
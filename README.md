# Screen Time 数据分析工具

## 项目概述
本项目是一个用于分析Screen Time数据的Python工具，通过连接SQLite数据库，查询指定日期（2025-04-29）的应用使用数据，并对数据进行处理和可视化。主要功能包括：
- 从数据库中提取应用使用数据。
- 计算每个应用的使用时长。
- 绘制各应用使用时长的柱状图。
- 绘制应用使用情况的甘特图。

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
- `app_usage_bar_chart.png`：各应用使用时长的柱状图。
- `screen_time_gantt.png`：应用使用情况的甘特图。

## 注意事项
- 数据库查询日期固定为2025-04-29，如需修改日期，请编辑`main.py`文件中的`target_date`变量。
- 确保系统支持`Songti SC`或`PingFang SC`字体，以避免中文显示问题。
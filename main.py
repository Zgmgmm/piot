import matplotlib.pyplot as plt
# 设置全局字体为宋体，解决中文显示问题
plt.rcParams['font.sans-serif'] = ['Songti SC']  # 或使用 'PingFang SC'
# 解决负号显示问题
plt.rcParams['axes.unicode_minus'] = False

import sqlite3
import pandas as pd
from datetime import datetime, timedelta
from pytz import timezone
import numpy as np

import argparse
MACOS_EPOCH_OFFSET = 978307200  # macOS时间戳偏移量
# 计算昨天的日期
yesterday = (datetime.now() - timedelta(days=1)).strftime('%Y-%m-%d')
TARGET_DATE = yesterday       # 查询日期

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='查询屏幕使用时间数据的日期和数据库路径')
    parser.add_argument('target_date', type=str, nargs='?', default=yesterday, help='查询日期，格式：YYYY-MM-DD，默认为昨天。')
    parser.add_argument('--db_path', type=str, default='/Users/bytedance/Library/Application Support/Knowledge/knowledgeC.db', help='数据库路径，默认为系统默认路径。')
    args = parser.parse_args()
    TARGET_DATE = args.target_date
    DB_PATH = args.db_path

def get_screen_time_data():
    # 连接数据库
    conn = sqlite3.connect(DB_PATH)
    
    query = f"""
    SELECT 
        ZOBJECT.ZVALUESTRING as app_name,
        ZOBJECT.ZSTARTDATE as start_time,
        ZOBJECT.ZENDDATE as end_time
    FROM 
        ZOBJECT
    WHERE 
        ZSTREAMNAME = '/app/usage' 
        AND date(ZOBJECT.ZSTARTDATE + {MACOS_EPOCH_OFFSET}, 'unixepoch', 'localtime') = '{TARGET_DATE}'
        AND ZOBJECT.ZVALUESTRING IS NOT NULL
    ORDER BY 
        ZOBJECT.ZSTARTDATE
    """
    
    df = pd.read_sql_query(query, conn)
    conn.close()
    
    # 转换时间戳，macOS 时间戳从 2001-01-01 开始
    df['start_time'] = pd.to_datetime(df['start_time'] + MACOS_EPOCH_OFFSET, unit='s').dt.tz_localize('UTC').dt.tz_convert(timezone('Asia/Shanghai'))
    df['end_time'] = pd.to_datetime(df['end_time'] + MACOS_EPOCH_OFFSET, unit='s').dt.tz_localize('UTC').dt.tz_convert(timezone('Asia/Shanghai'))
    
    return df

def calculate_app_usage(df):
    # 按应用名称分组，求和使用时长
    app_usage = df.groupby('app_name')['duration'].sum().reset_index()
    app_usage.columns = ['应用名称', '使用时长（分钟）']
    return app_usage

def visualize_app_usage(app_usage):
    plt.figure(figsize=(10, 6))
    bars = plt.bar(app_usage['应用名称'], app_usage['使用时长（分钟）'])
    plt.xlabel('应用名称')
    plt.ylabel('使用时长（分钟）')
    plt.title('各应用使用时长统计')
    plt.xticks(rotation=45)

    # 添加数据标签
    for bar in bars:
        height = bar.get_height()
        plt.annotate(f'{height:.1f}',
                     xy=(bar.get_x() + bar.get_width() / 2, height),
                     xytext=(0, 3),  # 垂直偏移 3 点
                     textcoords='offset points',
                     ha='center', va='bottom')

    plt.tight_layout()
    plt.savefig("app_usage_bar_chart.png")
    plt.show()

def generate_gantt_chart(df):
    # 合并相邻时间段的函数
    def merge_intervals(group: pd.DataFrame) -> pd.DataFrame:
        """
        合并相邻时间段
        
        Args:
            group: 按应用分组的时间段数据
            threshold: 合并间隔阈值（分钟）
        
        Returns:
            合并后的时间段DataFrame
        """
        if len(group) == 0:
            return group
        # 按开始时间排序
        sorted_group = group.sort_values('start_time')
        merged = []
        current = sorted_group.iloc[0]
        
        for _, row in sorted_group.iloc[1:].iterrows():
            # 计算时间间隔（分钟）
            gap = (row['start_time'] - current['end_time']).total_seconds() / 60
            if gap <= 3:  # 3 分钟间隔阈值
                # 合并时间段
                current['end_time'] = max(current['end_time'], row['end_time'])
            else:
                merged.append(current)
                current = row
        merged.append(current)
        return pd.DataFrame(merged)

    # 过滤结束时间早于开始时间的记录
    df = df[df['end_time'] > df['start_time']].copy()
    
    # 按应用名称分组，合并相邻时间段
    df = df.groupby('app_name', group_keys=False).apply(merge_intervals).reset_index(drop=True)
    
    # 计算相对分钟和使用时长
    df['start_minutes'] = df['start_time'].dt.hour * 60 + df['start_time'].dt.minute + df['start_time'].dt.second / 60
    df['duration'] = (df['end_time'] - df['start_time']).dt.total_seconds() / 60

    # 按总使用时长排序并过滤总时长≥2分钟的应用
    total_usage = df.groupby('app_name')['duration'].sum()
    total_usage = total_usage[total_usage >= 2].sort_values(ascending=False)
    
    # 重建应用顺序映射
    app_order = {app: i for i, app in enumerate(total_usage.index)}
    df = df[df['app_name'].isin(total_usage.index)]  # 过滤数据集
    df['y'] = df['app_name'].map(app_order)
    df = df.sort_values('y')  # 排序

    # 更新颜色分配逻辑
    unique_apps = total_usage.index.tolist()

    if df.empty:
        print("数据为空，无法绘制甘特图。")
        return

    # 计算时间范围
    min_start = df['start_minutes'].min()
    max_end = (df['start_minutes'] + df['duration']).max()

    # 扩展时间范围 30 分钟
    new_min = max(0, min_start - 30)
    new_max = min(1440, max_end + 30)

    # 绘制甘特图
    fig, ax = plt.subplots(figsize=(16, 8))
    ax.set_title(f"{TARGET_DATE} 应用使用情况（甘特图）", fontsize=16)

    # 使用过滤后的应用列表分配颜色
    colors = plt.cm.tab20(np.linspace(0, 1, len(unique_apps)))
    app_colors = {app: colors[i] for i, app in enumerate(unique_apps)}

    def format_time(minutes):
        hours = int(minutes // 60)
        minutes = int(minutes % 60)
        return f"{hours}h{minutes}m" if hours > 0 else f"{int(minutes)}m"
    def format_duration(minutes: float) -> str:
        """将分钟数格式化为小时分钟表示"""
        return f"{int(minutes//60)}h{int(minutes%60)}m" if minutes >= 60 else f"{int(minutes)}m"
    bars = []  # 存储所有条形对象
    for _, row in df.iterrows():
        # 在合并前计算总使用时长
        total_usage_before_merge = df[df['end_time'] > df['start_time']].groupby('app_name')['duration'].sum().sort_values(ascending=False)
        bar = ax.barh(f'{row["app_name"]}\n{format_time(total_usage_before_merge[row["app_name"]])}', row['duration'], 
                     left=row['start_minutes'], 
                     height=0.5,
                     color=app_colors[row['app_name']])  # 使用固定颜色
        bars.append(bar)
        
        # 仅持续时间≥8 分钟时显示标签
        duration = row['duration']
        if duration >= 8:
            hours = int(duration // 60)
            minutes = int(duration % 60)
            label = f"{hours}h{minutes}m" if hours > 0 else f"{int(duration)}m"
            
            ax.text(
                x=row['start_minutes'] + duration/2,
                y=row['y'],
                s=label,
                ha='center', 
                va='center',
                color='white',
                fontsize=8
            )

    # 设置横轴范围和标签
    ax.set_xlim(new_min, new_max)
    # 只保留整点和半点的刻度
    ticks = [tick for tick in range(int(new_min), int(new_max) + 1) if tick % 30 == 0]
    ax.set_xticks(ticks)
    ax.set_xticklabels([f"{i // 60:02d}:{i % 60:02d}" for i in ticks])
    ax.set_xlabel("时间", fontsize=12)
    ax.set_ylabel("应用", fontsize=12)
    ax.grid(axis='x', linestyle='--', alpha=0.7)

    plt.tight_layout()
    plt.savefig("screen_time_gantt.png")
    plt.show()

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description='查询屏幕使用时间数据的日期')
    parser.add_argument('target_date', type=str, nargs='?', default=yesterday, help='查询日期，格式：YYYY-MM-DD，默认为昨天。')
    args = parser.parse_args()
    TARGET_DATE = args.target_date
    df = get_screen_time_data()
    if df.empty:
        print("未查询到数据，请确认日期或权限设置。")
    else:
        # 过滤结束时间早于开始时间的记录，计算相对分钟和使用时长
        df = df[df['end_time'] > df['start_time']].copy()
        df['start_minutes'] = df['start_time'].dt.hour * 60 + df['start_time'].dt.minute + df['start_time'].dt.second / 60
        df['duration'] = (df['end_time'] - df['start_time']).dt.total_seconds() / 60

        # 计算每个应用的使用时长
        app_usage = calculate_app_usage(df)
        print(app_usage)
        
        # 可视化应用使用时长
        # visualize_app_usage(app_usage)
        
        generate_gantt_chart(df)
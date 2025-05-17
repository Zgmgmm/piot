# -*- coding: utf-8 -*-
import numpy as np
import matplotlib.pyplot as plt
plt.rcParams['font.sans-serif'] = ['Songti SC']
plt.rcParams['axes.unicode_minus'] = False

import sqlite3
import pandas as pd
from datetime import datetime, timedelta
from pytz import timezone

import argparse
from flask import Flask, request, jsonify
MACOS_EPOCH_OFFSET = 978307200

yesterday = (datetime.now() - timedelta(days=1)).strftime('%Y-%m-%d')

# 初始化全局变量
TARGET_DATE = yesterday
DB_PATH = '/Users/bytedance/Library/Application Support/Knowledge/knowledgeC.db'

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

    df = df[df['end_time'] > df['start_time']].copy()
    df['start_minutes'] = df['start_time'].dt.hour * 60 + df['start_time'].dt.minute + df['start_time'].dt.second / 60
    df['duration'] = (df['end_time'] - df['start_time']).dt.total_seconds() / 60

    # 过滤结束时间早于开始时间的记录
    df = df[df['end_time'] > df['start_time']].copy()
    
    # 按应用名称分组，合并相邻时间段
    df = df.groupby('app_name', group_keys=False).apply(merge_intervals).reset_index(drop=True)
    
    # 计算相对分钟和使用时长
    df['start_minutes'] = df['start_time'].dt.hour * 60 + df['start_time'].dt.minute + df['start_time'].dt.second / 60
    df['duration'] = (df['end_time'] - df['start_time']).dt.total_seconds() / 60

    # 过滤总时长≥2分钟的应用
    total_usage = df.groupby('app_name')['duration'].sum()
    total_usage = total_usage[total_usage >= 2].sort_values(ascending=False)
    df = df[df['app_name'].isin(total_usage.index)]  # 过滤数据集

    # 按总使用时长排序
    app_order = {app: i for i, app in enumerate(total_usage.index)}
    df['y'] = df['app_name'].map(lambda x: app_order.get(x, -1))
    df = df[df['y'] != -1].copy()
    df = df.sort_values('y')  # 排序

    return df

def get_app_display_name(app_name):
    """将应用包名映射为中文显示名称
    
    如果在映射中找不到，对于a.b.c格式的包名，返回c部分
    """
    name_mapping = {
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
    }
    
    # 如果在映射中找到则直接返回
    if app_name in name_mapping:
        return name_mapping[app_name]
    
    # 如果是a.b.c格式的包名，返回c部分
    # if '.' in app_name:
    #     return app_name.split('.')[-1]
    
    # 其他情况返回原始名称
    return app_name

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
        if gap <= 3 or (row['app_name'] == 'com.electron.lark.iron' and gap<=10):  # 3 分钟间隔阈值
            # 合并时间段
            current['end_time'] = max(current['end_time'], row['end_time'])
        else:
            merged.append(current)
            current = row
    merged.append(current)
    return pd.DataFrame(merged)

def generate_gantt_chart(df):
    # 添加显示名称映射（移动到循环前）
    df['display_name'] = df['app_name'].apply(get_app_display_name)

    if df.empty:
        print("合并后的数据为空，无法绘制甘特图。")
        return

    # 计算时间范围
    min_start = df['start_minutes'].min()
    max_end = (df['start_minutes'] + df['duration']).max()

    # 扩展时间范围 30 分钟
    new_min = max(0, min_start - 30)
    new_max = min(1440, max_end + 30)

    # 初始化绘图对象
    fig, ax = plt.subplots(figsize=(16, 8))
    ax.set_title(f"{TARGET_DATE} 应用使用情况（甘特图）", fontsize=16)

    # 检测时间空档
    all_blocks = pd.concat([df['start_minutes'], df['start_minutes'] + df['duration']], axis=1)
    all_blocks.columns = ['start', 'end']
    all_blocks = all_blocks.sort_values('start').reset_index(drop=True)

    gaps = []
    prev_end = new_min
    for _, block in all_blocks.iterrows():
        gap_duration = block['start'] - prev_end
        if gap_duration >= 5:  # 空档阈值提升至5分钟
            gaps.append((prev_end, block['start']))
                        # 动态调整标签垂直位置
            hours = int(gap_duration // 60)
            minutes = int(gap_duration % 60)
            label = f"{hours}h{minutes}m" if hours > 0 else f"{int(gap_duration)}m"
            ax.text(
                x=(prev_end + block['start'])/2,
                y=-1,  # 调整到横轴下方
                s=label,
                ha='center',
                va='bottom',  # 改为底部对齐
                color='white',
                fontsize=10,
                weight='bold',
                alpha=0.9,
                zorder=2,
                bbox=dict(boxstyle='round', facecolor='#404040', edgecolor='black', alpha=0.7)
            )
        
        prev_end = max(prev_end, block['end'])
    
    if prev_end < new_max:
        gaps.append((prev_end, new_max))

    # 先绘制时间空档
    for gap_start, gap_end in gaps:
        ax.axvspan(gap_start, gap_end, color='lightgray', alpha=0.3, zorder=0)

    # 更新颜色分配逻辑
    unique_apps = df['app_name'].unique().tolist()
    # 使用过滤后的应用列表分配颜色
    colors = plt.cm.tab20(np.linspace(0, 1, len(unique_apps)))
    app_colors = {app: colors[i] for i, app in enumerate(unique_apps)}

    def format_time(minutes):
        hours = int(minutes // 60)
        minutes = int(minutes % 60)
        return f"{hours}h{minutes}m" if hours > 0 else f"{int(minutes)}m"
        """将分钟数格式化为小时分钟表示"""
        return f"{int(minutes//60)}h{int(minutes%60)}m" if minutes >= 60 else f"{int(minutes)}m"
    bars = []  # 存储所有条形对象
    for _, row in df.iterrows():
        # 在合并前计算总使用时长
        total_usage_before_merge = df[df['end_time'] > df['start_time']].groupby('app_name')['duration'].sum().sort_values(ascending=False)
        
        # 修改barh调用处（此时display_name已存在）
        bar = ax.barh(f'{row["display_name"]}\n{format_time(total_usage_before_merge[row["app_name"]])}', row['duration'], 
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
    ax.set_ylim(bottom=-0.5)  # 减少底部空白区域
    plt.subplots_adjust(bottom=0.12)  # 调整底部边距
    # 只保留整点和半点的刻度
    ticks = [tick for tick in range(int(new_min), int(new_max) + 1) if tick % 30 == 0]
    ax.set_xticks(ticks)
    ax.set_xticklabels([f"{i // 60:02d}:{i % 60:02d}" for i in ticks])
    ax.set_xlabel("时间", fontsize=12)
    ax.set_ylabel("应用", fontsize=12)
    ax.grid(axis='x', linestyle='--', alpha=0.7)

    plt.subplots_adjust(bottom=0.15)
    plt.savefig("screen_time_gantt.png")
    plt.show()


app = Flask(__name__, static_folder='static')

@app.route('/api/data')
def get_data():
    target_date = request.args.get('date', yesterday)
    global TARGET_DATE
    TARGET_DATE = target_date
    df = get_screen_time_data()
    # 处理数据并添加显示名称
    df['display_name'] = df['app_name'].apply(get_app_display_name)
    # 转换为JSON可序列化格式
    data = []
    for _, row in df.iterrows():
        data.append({
            'app_name': row['display_name'],
            'start_time': row['start_time'].isoformat(),
            'end_time': row['end_time'].isoformat(),
        })
    return jsonify(data)

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='查询屏幕使用时间数据的日期和数据库路径')
    parser.add_argument('--web', action='store_true', help='启动Web服务')
    parser.add_argument('target_date', type=str, nargs='?', default=yesterday, help='查询日期，格式：YYYY-MM-DD，默认为昨天。')
    parser.add_argument('--db_path', type=str, default='/Users/bytedance/Library/Application Support/Knowledge/knowledgeC.db', help='数据库路径，默认为系统默认路径。')
    args = parser.parse_args()
    TARGET_DATE = args.target_date
    DB_PATH = args.db_path
    web = args.web
    if web:
        app.run(host='0.0.0.0', port=5001)
        exit()

    df = get_screen_time_data()
    if df.empty:
        print("未查询到数据，请确认日期或权限设置。")
    else:
        app_usage = df.groupby('app_name')['duration'].sum().reset_index()
        app_usage.columns = ['应用名称', '使用时长（分钟）']
        print(app_usage)
        generate_gantt_chart(df)

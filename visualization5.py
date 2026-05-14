"""
visualization5.py
- 폴더 안의 CSV 파일을 드롭다운으로 골라서
- 임의의 컬럼들을 골라 비교 (Overlay / Subplot 토글)
- 좌/우 y축 분리, Min-Max 정규화, x축 범위 슬라이더, 통계 요약 제공
"""

import os
import glob
import logging

import numpy as np
import pandas as pd
import plotly.graph_objects as go
from plotly.subplots import make_subplots

import dash
from dash import dcc, html, dash_table
from dash.dependencies import Input, Output, State

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")

DATA_DIR = os.path.dirname(os.path.abspath(__file__))


def list_csv_files():
    files = sorted(glob.glob(os.path.join(DATA_DIR, "*.csv")))
    return [os.path.basename(f) for f in files]


def load_csv(filename):
    path = os.path.join(DATA_DIR, filename)
    df = pd.read_csv(path)
    df.columns = [str(c) for c in df.columns]
    return df


def numeric_columns(df):
    return [c for c in df.columns if pd.api.types.is_numeric_dtype(df[c])]


def normalize_series(s):
    s = pd.to_numeric(s, errors="coerce")
    lo, hi = s.min(), s.max()
    if pd.isna(lo) or pd.isna(hi) or hi == lo:
        return s * 0
    return (s - lo) / (hi - lo)


COLOR_PALETTE = [
    "#1f77b4", "#ff7f0e", "#2ca02c", "#d62728", "#9467bd",
    "#8c564b", "#e377c2", "#7f7f7f", "#bcbd22", "#17becf",
]


app = dash.Dash(__name__)
app.title = "Column Comparator"

initial_files = list_csv_files()
initial_file = initial_files[0] if initial_files else None
initial_df = load_csv(initial_file) if initial_file else pd.DataFrame()
initial_num_cols = numeric_columns(initial_df)

SIDEBAR_WIDTH = 340  # px
N_GROUPS = 4  # Subplot 그룹 개수 (각 그룹 = 한 row)


def group_block(idx, num_cols, default_value=None):
    return html.Div([
        html.Label(f"Subplot {idx + 1}", style={"marginTop": "10px", "fontWeight": "600"}),
        dcc.Dropdown(
            id=f"group-{idx}",
            options=[{"label": c, "value": c} for c in num_cols],
            value=default_value or [],
            multi=True,
            placeholder="컬럼 선택…",
        ),
    ])

sidebar = html.Div(
    id="sidebar",
    style={
        "width": f"{SIDEBAR_WIDTH}px",
        "minWidth": f"{SIDEBAR_WIDTH}px",
        "height": "100vh",
        "overflowY": "auto",
        "padding": "16px",
        "borderRight": "1px solid #ddd",
        "background": "#fafafa",
        "boxSizing": "border-box",
    },
    children=[
        html.Div(
            style={"display": "flex", "alignItems": "center", "justifyContent": "space-between", "marginBottom": "12px"},
            children=[
                html.H3("Options", style={"margin": 0}),
                html.Button("⟨", id="sidebar-toggle", n_clicks=0,
                            style={"border": "1px solid #ccc", "background": "white",
                                   "padding": "2px 10px", "cursor": "pointer", "fontSize": "16px"}),
            ],
        ),

        html.Label("CSV file"),
        dcc.Dropdown(
            id="file-dropdown",
            options=[{"label": f, "value": f} for f in initial_files],
            value=initial_file,
            clearable=False,
        ),

        html.Label("X axis", style={"marginTop": "10px"}),
        dcc.Dropdown(
            id="x-dropdown",
            options=[{"label": c, "value": c} for c in initial_df.columns],
            value="timer" if "timer" in initial_df.columns else (initial_df.columns[0] if len(initial_df.columns) else None),
            clearable=False,
        ),

        html.Label("Display mode", style={"marginTop": "10px"}),
        dcc.RadioItems(
            id="mode-radio",
            options=[
                {"label": " Overlay  ", "value": "overlay"},
                {"label": " Subplots", "value": "subplots"},
            ],
            value="subplots",
            inline=True,
        ),

        html.Div(
            style={"marginTop": "8px", "borderTop": "1px solid #ddd", "paddingTop": "6px"},
            children=[
                html.Div("Y columns by subplot", style={"fontSize": "12px", "color": "#666"}),
                *[group_block(k, initial_num_cols, default_value=(initial_num_cols[:2] if k == 0 else []))
                  for k in range(N_GROUPS)],
            ],
        ),

        html.Label("Normalize (Min-Max)", style={"marginTop": "10px"}),
        dcc.RadioItems(
            id="norm-radio",
            options=[
                {"label": " Off ", "value": "off"},
                {"label": " On ", "value": "on"},
            ],
            value="off",
            inline=True,
        ),

        html.Label("Secondary y-axis columns (overlay only)", style={"marginTop": "10px"}),
        dcc.Dropdown(
            id="secondary-dropdown",
            options=[{"label": c, "value": c} for c in initial_num_cols],
            value=[],
            multi=True,
        ),

        html.Label("X range (% of data)", style={"marginTop": "10px"}),
        dcc.RangeSlider(
            id="range-slider",
            min=0, max=100, step=1, value=[0, 100],
            marks={i: f"{i}%" for i in range(0, 101, 25)},
            tooltip={"placement": "bottom", "always_visible": False},
        ),

        html.H4("Statistics", style={"marginTop": "16px"}),
        dash_table.DataTable(
            id="stats-table",
            columns=[
                {"name": "col", "id": "column"},
                {"name": "min", "id": "min"},
                {"name": "max", "id": "max"},
                {"name": "mean", "id": "mean"},
                {"name": "std", "id": "std"},
            ],
            style_cell={"textAlign": "right", "fontFamily": "Consolas, monospace",
                        "padding": "4px", "fontSize": "12px"},
            style_header={"fontWeight": "bold", "backgroundColor": "#f0f0f0"},
            style_data_conditional=[{"if": {"column_id": "column"}, "textAlign": "left"}],
        ),
    ],
)

main = html.Div(
    id="main",
    style={"flex": "1", "padding": "8px", "boxSizing": "border-box", "position": "relative"},
    children=[
        html.Button("⟩", id="sidebar-show", n_clicks=0,
                    style={"position": "absolute", "left": "4px", "top": "8px",
                           "border": "1px solid #ccc", "background": "white",
                           "padding": "2px 10px", "cursor": "pointer", "fontSize": "16px",
                           "display": "none", "zIndex": 10}),
        dcc.Graph(id="main-graph", style={"height": "98vh"},
                  config={"responsive": True}),
    ],
)

app.layout = html.Div(
    style={"fontFamily": "Segoe UI, sans-serif", "display": "flex",
           "height": "100vh", "margin": 0, "overflow": "hidden"},
    children=[
        dcc.Store(id="sidebar-open", data=True),
        sidebar,
        main,
    ],
)

# 사이드바를 페이지 전체에 꽉 차게 (Dash 기본 body margin 제거)
app.index_string = """<!DOCTYPE html>
<html>
<head>
    {%metas%}
    <title>{%title%}</title>
    {%favicon%}
    {%css%}
    <style>html, body { margin: 0; padding: 0; height: 100%; overflow: hidden; }</style>
</head>
<body>
    {%app_entry%}
    <footer>{%config%}{%scripts%}{%renderer%}</footer>
</body>
</html>"""


# 파일 변경 시 컬럼 옵션들 갱신 (X, secondary, 모든 그룹)
@app.callback(
    Output("x-dropdown", "options"),
    Output("x-dropdown", "value"),
    Output("secondary-dropdown", "options"),
    Output("secondary-dropdown", "value"),
    *[Output(f"group-{k}", "options") for k in range(N_GROUPS)],
    *[Output(f"group-{k}", "value") for k in range(N_GROUPS)],
    Input("file-dropdown", "value"),
)
def update_columns(filename):
    if not filename:
        empty_opts = [[]] * N_GROUPS
        empty_vals = [[]] * N_GROUPS
        return ([], None, [], [], *empty_opts, *empty_vals)
    df = load_csv(filename)
    all_cols = list(df.columns)
    num_cols = numeric_columns(df)
    x_default = "timer" if "timer" in all_cols else (all_cols[0] if all_cols else None)

    group_opts = [[{"label": c, "value": c} for c in num_cols]] * N_GROUPS
    group_vals = [num_cols[:2] if k == 0 else [] for k in range(N_GROUPS)]

    return (
        [{"label": c, "value": c} for c in all_cols],
        x_default,
        [{"label": c, "value": c} for c in num_cols],
        [],
        *group_opts,
        *group_vals,
    )


@app.callback(
    Output("main-graph", "figure"),
    Output("stats-table", "data"),
    Input("file-dropdown", "value"),
    Input("x-dropdown", "value"),
    Input("mode-radio", "value"),
    Input("norm-radio", "value"),
    Input("secondary-dropdown", "value"),
    Input("range-slider", "value"),
    *[Input(f"group-{k}", "value") for k in range(N_GROUPS)],
)
def update_graph(filename, x_col, mode, norm, secondary_cols, x_range, *group_values):
    # 빈 그룹 스킵, 입력 그대로 보존
    groups = [list(g or []) for g in group_values]
    all_y_cols = [c for g in groups for c in g]

    if not filename or not x_col or not all_y_cols:
        return go.Figure(), []

    df = load_csv(filename)
    n = len(df)
    lo, hi = int(n * x_range[0] / 100), int(n * x_range[1] / 100)
    df = df.iloc[lo:hi].copy()

    secondary_cols = secondary_cols or []
    color_idx = 0  # 컬럼 등장 순서대로 색 배정

    if mode == "overlay":
        # 모든 그룹의 컬럼을 한 차트에 합쳐서 표시
        use_secondary = any(c in secondary_cols for c in all_y_cols)
        fig = make_subplots(specs=[[{"secondary_y": use_secondary}]])
        for col in all_y_cols:
            if col not in df.columns:
                continue
            y = normalize_series(df[col]) if norm == "on" else df[col]
            fig.add_trace(
                go.Scatter(
                    x=df[x_col], y=y, mode="lines", name=col,
                    line=dict(color=COLOR_PALETTE[color_idx % len(COLOR_PALETTE)], width=1.5),
                    hovertemplate=f"{col}<br>{x_col}=%{{x}}<br>value=%{{y}}<extra></extra>",
                ),
                secondary_y=(col in secondary_cols),
            )
            color_idx += 1
        fig.update_xaxes(title_text=x_col)
        fig.update_yaxes(title_text="value (left)", secondary_y=False)
        if use_secondary:
            fig.update_yaxes(title_text="value (right)", secondary_y=True)
    else:
        # subplots: 비어있지 않은 그룹만 row로 사용, 그룹 안 컬럼들은 같은 row에 overlay
        active_groups = [(i, g) for i, g in enumerate(groups) if g]
        rows = len(active_groups)
        titles = [", ".join(g) for _, g in active_groups]
        fig = make_subplots(
            rows=rows, cols=1, shared_xaxes=True,
            subplot_titles=titles, vertical_spacing=0.05,
        )
        for row_idx, (group_idx, cols) in enumerate(active_groups, start=1):
            for col in cols:
                if col not in df.columns:
                    continue
                raw = df[col]
                y = normalize_series(raw) if norm == "on" else raw
                fig.add_trace(
                    go.Scatter(
                        x=df[x_col], y=y, mode="lines", name=col,
                        legendgroup=f"row{row_idx}",
                        legendgrouptitle_text=f"Subplot {group_idx + 1}",
                        line=dict(color=COLOR_PALETTE[color_idx % len(COLOR_PALETTE)], width=1.5),
                        hovertemplate=f"{col}<br>{x_col}=%{{x}}<br>value=%{{y}}<extra></extra>",
                    ),
                    row=row_idx, col=1,
                )
                color_idx += 1
            fig.update_yaxes(row=row_idx, col=1, tickformat=".6~g")
        fig.update_xaxes(title_text=x_col, row=rows, col=1)

    fig.update_layout(
        autosize=True,
        margin=dict(l=60, r=40, t=40, b=40),
        legend=dict(orientation="h", y=-0.08, x=0),
        plot_bgcolor="white",
        hovermode="x unified",
        uirevision=f"{filename}|{x_col}|{mode}",  # 줌/팬 유지
    )
    fig.update_xaxes(showgrid=True, gridcolor="#eee")
    fig.update_yaxes(showgrid=True, gridcolor="#eee")

    # 통계 (정밀도 6자리, 등장 순서 보존)
    stats = []
    seen = set()
    for col in all_y_cols:
        if col in seen or col not in df.columns:
            continue
        seen.add(col)
        s = pd.to_numeric(df[col], errors="coerce")
        stats.append({
            "column": col,
            "min": f"{s.min():.6g}" if s.count() else "",
            "max": f"{s.max():.6g}" if s.count() else "",
            "mean": f"{s.mean():.6g}" if s.count() else "",
            "std": f"{s.std():.6g}" if s.count() else "",
        })

    return fig, stats


@app.callback(
    Output("sidebar", "style"),
    Output("main", "style"),
    Output("sidebar-show", "style"),
    Output("sidebar-open", "data"),
    Input("sidebar-toggle", "n_clicks"),
    Input("sidebar-show", "n_clicks"),
    State("sidebar-open", "data"),
)
def toggle_sidebar(hide_clicks, show_clicks, is_open):
    ctx = dash.callback_context
    if ctx.triggered:
        trig = ctx.triggered[0]["prop_id"].split(".")[0]
        if trig == "sidebar-toggle":
            is_open = False
        elif trig == "sidebar-show":
            is_open = True

    base_sidebar = {
        "width": f"{SIDEBAR_WIDTH}px",
        "minWidth": f"{SIDEBAR_WIDTH}px",
        "height": "100vh",
        "overflowY": "auto",
        "padding": "16px",
        "borderRight": "1px solid #ddd",
        "background": "#fafafa",
        "boxSizing": "border-box",
    }
    base_main = {"flex": "1", "padding": "8px", "boxSizing": "border-box", "position": "relative"}
    show_btn_base = {
        "position": "absolute", "left": "4px", "top": "8px",
        "border": "1px solid #ccc", "background": "white",
        "padding": "2px 10px", "cursor": "pointer", "fontSize": "16px",
        "zIndex": 10,
    }

    if is_open:
        return base_sidebar, base_main, {**show_btn_base, "display": "none"}, True
    else:
        return ({**base_sidebar, "display": "none"},
                base_main,
                {**show_btn_base, "display": "block"},
                False)


if __name__ == "__main__":
    app.run(debug=True, port=8053)

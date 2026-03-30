# -*- coding: utf-8 -*-
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
import sys
from xml.sax.saxutils import escape
import zipfile


OUTPUT_NAME = "FluxView_specification_structure.xlsx"
FALLBACK_SUFFIX = "_latest"


@dataclass(frozen=True)
class SheetData:
    kind: str
    name: str
    title: str
    subtitle: str
    headers: tuple[str, ...]
    widths: tuple[int, ...]
    rows: tuple[tuple[str, ...], ...]


STYLE_TITLE = 1
STYLE_SUBTITLE = 2
STYLE_HEADER = 3
STYLE_BODY = 4
STYLE_HIERARCHY = 5
STYLE_PRIORITY_HIGH = 6
STYLE_PRIORITY_MEDIUM = 7
STYLE_PRIORITY_LOW = 8
STYLE_PHASE = 9
STYLE_STATUS_CURRENT = 10
STYLE_STATUS_WARNING = 11
STYLE_STATUS_PENDING = 12


def col_letter(index: int) -> str:
    result = ""
    current = index
    while current > 0:
        current, remainder = divmod(current - 1, 26)
        result = chr(65 + remainder) + result
    return result


def inline_cell(ref: str, text: str, style_id: int) -> str:
    value = "" if text is None else str(text)
    text_xml = escape(value)
    if value.strip() != value or "\n" in value:
        return (
            f'<c r="{ref}" s="{style_id}" t="inlineStr">'
            f'<is><t xml:space="preserve">{text_xml}</t></is>'
            "</c>"
        )
    return f'<c r="{ref}" s="{style_id}" t="inlineStr"><is><t>{text_xml}</t></is></c>'


def body_row(*values: str) -> tuple[str, ...]:
    return tuple(values)


SHEETS: tuple[SheetData, ...] = (
    SheetData(
        kind="overview",
        name="Part A 概要",
        title="Part A - 概要編（全読者共通）",
        subtitle="対象版: 2026-03-30 時点の現行仕様",
        headers=("No.", "大分類", "中分類", "項目名", "仕様概要", "詳細仕様", "対象読者", "備考"),
        widths=(10, 18, 18, 20, 36, 56, 16, 20),
        rows=(
            body_row("A-001", "ドキュメント管理情報", "文書管理", "文書の目的", "FluxView の現行仕様を、顧客説明と開発実装の双方で参照できるように整理する。", "対象範囲は進捗管理、現場配置、シフト管理、送信実績、マスタ管理、ユーザー管理、通知管理、作業者画面を含む現行プロトタイプ全体とする。変更履歴ではなく、最新仕様のみを記述する。", "全読者", "運営説明と開発着手の共通母体。"),
            body_row("A-002", "", "", "対象版", "本書は 2026-03-30 時点の現行仕様を対象とする。", "Vercel Preview とローカル実装で確認できる最新 UI を基準とする。撤去済み standalone 業務管理画面や旧表記は本文から除外する。", "全読者", "版数履歴そのものは本表に含めない。"),
            body_row("A-003", "", "配布・機密", "配布対象", "社内企画、顧客説明担当、開発委託先、現場責任者を主な読者とする。", "顧客向けには Part A〜C を主資料とし、Part D〜E は必要時に補足配布する。", "全読者", "役割別に参照深度を変える。"),
            body_row("A-004", "", "", "機密区分", "社外説明可能な仕様情報を中心に記載する。", "Preview URL の内部設定値、認証情報、環境変数、鍵情報は本書の対象外とする。", "社内・開発", "構成情報と秘密情報を分離する。"),
            body_row("A-005", "システム概要", "製品ビジョン", "製品ビジョン", "FluxView は『今日どこで何が滞っているか』『何人足りないか』『誰をどこへ動かすか』を一つの画面群で判断できる状態を目指す。", "可用人数、進捗、配置、送信実績、コストを同じ運営文脈でつなぎ、管理者の判断負荷を下げることが中心価値である。", "全読者", "管理者と作業者の双方を対象とする。"),
            body_row("A-006", "", "対象業務", "対象業務", "物流拠点の日次運営を対象とし、入荷、検品、格納、ピッキング、仕分け、出荷などの業務を扱う。", "荷主、拠点、区域、業務、業務フロー、作業者、派遣会社、資格、スキルを単位として、月次シフト作成から当日配置、実績回収、差異分析までを一連で扱う。", "顧客・開発", "帳票置換ではなく運営基盤として設計する。"),
            body_row("A-007", "", "解決する課題", "課題整理", "計画と実績、人員配置と進捗、勤怠と可用人数、派遣比率と原価差異が分断されている状態を解消する。", "現場責任者が複数帳票を見比べなくても、当日判断に必要な粒度で情報を再統合できることを目的とする。", "顧客・開発", "原因分析より即時判断を優先する。"),
            body_row("A-008", "", "価値連鎖", "運営価値連鎖", "シフト計画→可用人数可視化→必要人時計算→現場配置→実績回収→原価差異確認、という判断チェーンを一つの製品内で成立させる。", "シフト管理、作業日ビュー、進捗管理、現場配置、送信実績、コスト分析が相互参照される設計とし、『何人いるか』と『どう配置するか』を同じ製品でつなぐ。", "全読者", "FluxView のコア価値。"),
            body_row("A-009", "システム構成図", "アーキテクチャ", "全体アーキテクチャ", "フロントエンドは React + TypeScript + Vite。ルーティングは react-router、画面実装は src/app/components 配下に集約する。", "状態保持は Context と localStorage ベースの各 store を併用する。一部 Supabase 接続基盤を持つが、全面的なサーバー API 化は未完了である。", "開発", "フロント主導の検証構成。"),
            body_row("A-010", "", "モジュール関連図", "主要モジュール", "主要モジュールは Dashboard、現場配置、進捗管理、シフト管理、送信実績、コスト分析、派遣管理、マスタ管理、ユーザー管理、通知管理、作業者ビューである。", "マスタとユーザー/チーム情報が基盤データになり、シフトと進捗が現場配置へ入力され、送信実績とコスト分析が結果確認に使われる。", "顧客・開発", "現行 UI に存在するモジュールのみを対象とする。"),
            body_row("A-011", "", "外部連携", "外部連携前提", "想定外部連携先は勤怠システム、WMS、派遣会社関連データである。", "現段階で最低限必要なのは勤怠側からの出勤済み・未出勤・欠勤の状態同期であり、遅刻理由や詳細な勤怠計算は FluxView の責務外とする。", "顧客・開発", "I/F 詳細化は Part D 対象。"),
            body_row("A-012", "用語定義", "業務用語", "正式な管理単位", "正式な管理単位は荷主、拠点、区域、業務、業務フロー、作業者、派遣会社、資格、スキルである。", "『区域』は拠点配下の補助管理単位であり、旧来の独立エリアマスタではない。", "全読者", "用語統一の基準。"),
            body_row("A-013", "", "システム用語対応", "用語対応表", "現場で言う『工程』は、現在 UI 上では『業務』として扱う。", "複数の業務を束ねたテンプレートは『業務フロー』であり、進捗対象追加、現場配置、マスタ管理で共通に使う。作業区域は Site.layoutAreas、業務詳細は WorkflowStepSetting に保持する。", "顧客・開発", "旧表記との混同を避ける。"),
        ),
    ),
    SheetData(
        kind="function",
        name="Part B 機能",
        title="Part B - 機能仕様編（顧客 + 開発の共通言語）",
        subtitle="対象版: 2026-03-30 時点の現行仕様",
        headers=("No.", "大分類", "中分類", "機能名", "機能概要", "主な機能詳細", "優先度", "フェーズ", "ステータス", "備考"),
        widths=(10, 14, 18, 22, 34, 56, 10, 10, 12, 20),
        rows=(
            body_row("B-001", "可視化", "Dashboard", "KPI サマリー", "拠点全体の進捗・人員・原価差異を俯瞰表示する。", "KPI カード、チャート、アラート、重要異常件数を同一画面で表示し、当日確認の起点にする。", "高", "v1.0", "現行", "管理者の起点画面。"),
            body_row("B-002", "", "", "アラート一覧", "優先度付きの注意事項を一覧化する。", "遅延、人数不足、コスト逸脱、未送信などをレベル付きメッセージとして表示し、関連画面へ遷移できる。", "高", "v1.0", "現行", ""),
            body_row("B-003", "配置", "現場配置", "業務カード表示", "業務フロー配下の業務をカード単位で表示し、状況を見ながら人を配置する。", "区域、荷主、業務フロー、業務、予定数、実績数、残数、必要人時、完了見込み、配置人数をカードで表示する。", "高", "v1.0", "現行", "カード/表切替あり。"),
            body_row("B-004", "", "", "表ビュー", "業務をテーブル形式で見ながら配置する。", "作業者プールを上段、業務フロー別テーブルを下段に配置し、各行をドロップ先として扱う。開始/終了/予定数は参照表示とする。", "高", "v1.0", "現行", "進捗推移列は表示しない。"),
            body_row("B-005", "", "", "作業者プール", "未配置・待機/離席・分割削除枠をまとめて管理する。", "円形 icon 表示、右クリック分割、ドラッグ配置、hover 詳細カード、チーム色反映、仮チーム分けを扱う。", "高", "v1.0", "現行", ""),
            body_row("B-006", "", "", "拡大表示ダイアログ", "多人数を一覧できる作業者プール拡大表示を提供する。", "未配置作業者をチーム単位でグルーピングし、既存チームと仮チームを分けて表示する。仮チーム作成枠へ icon を入れると新規仮チームを生成する。", "中", "v1.0", "現行", ""),
            body_row("B-007", "", "", "チーム単位配置", "拡大表示中にチーム単位で複数人をまとめて配置する。", "チーム見出しをドラッグ元として扱い、業務行やカードへドロップするとチームメンバーを一括配置する。", "中", "v1.0", "現行", ""),
            body_row("B-008", "", "", "資格・スキル不足警告", "配置時の不足条件を消息条で通知する。", "不足資格、不足スキルをタグ付きメッセージとして表示し、配置自体は継続できる。", "高", "v1.0", "現行", ""),
            body_row("B-009", "進捗", "進捗管理", "業務フロー一覧", "業務フロー単位の進捗対象を一覧表示する。", "荷主数、業務フロー数、業務数、必要人時、出勤予定人時、過不足、不足人数をカードで表示し、同一業務フローは同系色ヘッダーでグルーピングする。", "高", "v1.0", "現行", ""),
            body_row("B-010", "", "", "業務テーブル", "業務ごとの計画と実績を表示する表。", "業務名の下に荷主・エリアのタグ、予定時刻、予定数、UPH、実績/予定、進捗率、見込み、状態を表示する。予定数は編集可能。", "高", "v1.0", "現行", ""),
            body_row("B-011", "", "", "必要人時計算", "予定数と UPH から必要人時を算出する。", "必要人時 = 予定数 ÷ UPH を基本とし、作業時間帯と組み合わせて推奨人数を算出する。", "高", "v1.0", "現行", ""),
            body_row("B-012", "", "", "前業務依存", "業務間の依存関係を保持し、処理可能数へ反映する。", "進捗対象追加ダイアログで各業務の前業務を設定し、予定数の下に『処理可能数』として前業務実績との差分を表示する。", "中", "v1.0", "現行", ""),
            body_row("B-013", "", "", "進捗推移モーダル", "単一業務の推移をチャートと時系列で確認する。", "予定、実績、残件数、見込み時刻を表示し、時間経過による傾きを確認できる。", "中", "v1.0", "現行", ""),
            body_row("B-014", "", "", "進捗対象追加", "業務フローテンプレートから進捗対象を追加する。", "テンプレートの業務一覧を表で表示し、開始予定時刻、終了予定時刻、予定数、UPH、荷主、エリア、前業務を個別編集できる。行追加、削除、並び替えに対応する。", "高", "v1.0", "現行", ""),
            body_row("B-015", "シフト", "シフト管理", "月次シフト表", "作業者 × 日付の月次シフトを一覧で管理する。", "出勤人数と人時の集計行、土日祝の色分け、テンプレート適用、複数セル選択、一括設定バーを提供する。", "高", "v1.0", "現行", ""),
            body_row("B-016", "", "", "作業日ビュー", "24 時間軸で必要人数と出勤人数を比較する。", "15分/30分/1時間の粒度で、必要人数ラインと出勤人数バーを表示し、逼迫時間帯を可視化する。必要人数は予定数・UPH・作業時間から算出する。", "高", "v1.0", "現行", "00:00-24:00 固定表示。"),
            body_row("B-017", "", "", "テンプレート管理", "勤務テンプレートをカテゴリ別に管理する。", "正社員、パートナー、派遣などのカテゴリごとに、開始・終了・色・休憩を保持するテンプレートを編集する。休憩は各テンプレート内で手動管理する。", "中", "v1.0", "現行", ""),
            body_row("B-018", "", "", "セル編集ポップオーバー", "単一セルの勤務内容を短時間で編集する。", "日勤/夕勤/夜勤/休の快選、開始/終了の微調整、休憩の手動編集、休憩不足・深夜勤務チェックを表示する。外側クリックで閉じる。", "高", "v1.0", "現行", ""),
            body_row("B-019", "", "", "一括設定バー", "複数セルへ同じ勤務をまとめて適用する。", "テンプレート選択後に開始/終了/休憩を手動調整し、勤務チェックを見ながら一括適用する。", "高", "v1.0", "現行", ""),
            body_row("B-020", "実績", "送信実績", "集約テーブル", "送信実績を作業者・業務・時間帯単位で集約表示する。", "荷主、業務、工程、開始/終了、所要時間、UPH、状態、ランクを表形式で表示し、予定と実績は『実績（予定）』形式で見せる。", "高", "v1.0", "現行", ""),
            body_row("B-021", "", "", "展開明細", "同一業務の複数回送信を展開表示する。", "先頭列の +/− ボタンから送信回数ごとの明細表を開き、送信時刻・数量・状態を確認する。", "中", "v1.0", "現行", ""),
            body_row("B-022", "分析", "コスト・需給", "コスト分析", "人件費、派遣比率、差異を分析する。", "拠点、荷主、業務別に予定原価と実績原価を比較し、派遣比率と差異金額を確認する。", "中", "v1.0", "現行", ""),
            body_row("B-023", "", "", "需給警告", "シフト上の可用人数と進捗上の必要人数の差を警告する。", "作業日ビューや進捗管理の必要人時をもとに、人数不足、時間帯不足を表示する。", "高", "v1.0", "現行", ""),
            body_row("B-024", "マスタ", "マスタ管理", "拠点・荷主・業務マスタ", "業務運営に必要な基礎マスタを一覧とモーダルで管理する。", "拠点、荷主、業務、業務フロー、資格、スキル、派遣会社をタブで分け、追加/編集は共通モーダルで行う。", "高", "v1.0", "現行", ""),
            body_row("B-025", "", "", "業務フロー定義", "複数業務を組み合わせた業務フローを登録する。", "現在選択中の拠点を前提に、複数業務の並び順、既定 UPH、区域設定を持つテンプレートを定義する。", "高", "v1.0", "現行", ""),
            body_row("B-026", "ユーザー", "ユーザー管理", "ユーザー CRUD", "ユーザーの基本情報、ロール、チーム、雇用形態を管理する。", "追加/編集は共通モーダルで行い、付与ロールは多選入力、チームは単一選択とする。チーム色は icon に反映する。", "高", "v1.0", "現行", ""),
            body_row("B-027", "", "", "チーム管理", "管理チームを登録し、テーマ色とメンバーを管理する。", "チーム一覧、追加/編集モーダル、テーマ色選択、所属ユーザーの一括管理を提供する。", "中", "v1.0", "現行", ""),
            body_row("B-028", "", "", "ロール・権限", "ロール別の権限制御設定を保持する。", "画面単位・操作単位の権限制御を保持し、一覧と詳細パネルから確認する。", "中", "v1.0", "現行", ""),
            body_row("B-029", "通知", "通知管理", "通知一覧", "管理者向けの通知を一覧・既読管理する。", "レベル、対象、発生時刻、既読状態を管理し、関連画面へ遷移できる。", "中", "v1.0", "現行", ""),
            body_row("B-030", "作業者", "作業者画面", "個人タスクビュー", "作業者本人向けに現在の担当と次の担当を見せる。", "現在配置、次配置、残時間、稼働率、担当ラベルをカード形式で表示する。", "中", "v1.0", "現行", ""),
            body_row("B-031", "", "", "バンドビュー", "作業者を横断的に帯表示する。", "現場責任者が複数作業者の配置帯と状況を並列で確認できる。", "中", "v1.0", "現行", ""),
        ),
    ),
    SheetData(
        kind="screen",
        name="Part C 画面",
        title="Part C - 画面仕様編（UI/UX の詳細）",
        subtitle="対象版: 2026-03-30 時点の現行仕様",
        headers=("No.", "大分類", "中分類", "画面名", "画面概要", "レイアウト", "入力項目", "表示項目", "操作仕様", "バリデーション", "権限制御", "レスポンシブ", "備考"),
        widths=(10, 14, 18, 22, 28, 34, 30, 34, 36, 24, 18, 20, 18),
        rows=(
            body_row("C-001", "管理者画面", "共通", "共通フレーム", "Sidebar、TopBar、本文領域からなる全画面共通レイアウト。", "左に固定サイドバー、上に固定トップバー、右側に本文スクロール領域を配置する。", "拠点選択、ページ切替、共通操作ボタン", "現在ページ名、共通説明、通知導線", "サイドバーから各画面へ遷移し、トップバーの拠点選択を全画面へ波及させる。", "拠点未選択時は拠点依存画面の一部操作を抑制する。", "ログイン済み管理者", "デスクトップ最適化、横幅不足時は本文優先で縮退", "色・余白基準を全画面で共通化。"),
            body_row("C-002", "管理者画面", "現場配置", "現場配置メイン", "現在時刻軸と業務カード群からなる配置画面。", "上部に時間軸、中央に業務カード/表ビュー、右側に作業者プールパネルを配置する。", "時間粒度、列数、カード/表ビュー切替", "時間軸、業務カード、消息条、作業者プール", "時間を切り替えると現在配置・次配置・残時間を再計算する。", "不正な時間入力は行わず、選択肢のみ操作する。", "現場責任者・管理者", "3/4/5列切替、狭幅時は列数を自動で落とせる", "右側パネルは列数に応じて幅を調整。"),
            body_row("C-003", "", "", "現場配置カードビュー", "業務単位をカードで配置する標準表示。", "同一業務フローを同系色背景でまとめ、各カードは業務名・状態・予定/実績・必要人時・進捗・配置エリアを持つ。", "ドロップ操作、状態に応じた hover", "区域、荷主、業務フロー、業務、開始/終了、予定数、実績数、残数、見込み", "作業者 icon をカードへドロップすると即時配置する。", "資格・スキル不足は警告表示するが配置自体は許可する。", "現場責任者・管理者", "列数切替に応じてカード幅を再計算", "業務フロー全体情報は表示しない。"),
            body_row("C-004", "", "", "現場配置表ビュー", "業務をテーブルで見ながら配置する表示。", "上段に作業者プール、下段に業務フロー別の表を配置する。", "ビュー切替、業務行へのドロップ", "業務、荷主、エリア、開始、終了、予定数、実績数、必要人時、状態", "表行へドロップして配置し、業務フロー単位でグルーピング行を表示する。", "開始/終了/予定数は参照表示のため直接入力しない。", "現場責任者・管理者", "表は横幅優先、必要時のみ横スクロール", "進捗推移列は表示しない。"),
            body_row("C-005", "", "", "作業者プールパネル", "未配置、待機/離席、調整リストを切り替える右パネル。", "タブ + 内容領域のカード構成。未配置はチーム単位で虚線枠グルーピングする。", "タブ切替、拡大表示ボタン", "作業者 icon、チーム名、人数、分割削除枠", "右クリックで分割、ドラッグで配置、拡大表示で全件一覧。", "未分割の 1/1 icon は分割削除対象にしない。", "現場責任者・管理者", "列数に応じてパネル幅を可変", "チーム未所属は灰色 icon。"),
            body_row("C-006", "", "", "作業者プール拡大表示", "多人数を見やすく並べる全画面モーダル。", "未配置、待機/離席、分割削除枠を縦積みし、未配置はチーム別セクションで整理する。", "仮チーム作成枠へのドロップ、チーム単位ドラッグ", "チーム名、人数、チーム色、作業者 icon", "未配置枠内の『仮チーム作成』枠へ icon をドロップすると新規仮チームを生成する。チーム見出しごと業務先へドロップすると一括配置する。", "仮チーム名重複は許可するが内部 ID は一意にする。", "現場責任者・管理者", "モーダルは大サイズ、内容は縦スクロール", "仮チームは現場配置専用の一時データ。"),
            body_row("C-007", "", "", "作業者 hover カード", "作業者 icon にマウスを置いた時の詳細カード。", "ポータル表示の浮遊カード。ヘッダー、現在の配置、次の配置、稼働率、資格/スキルアイコンで構成する。", "なし", "氏名、シフト時間、残時間、現在の配置、次の配置、エリア、業務フロー、荷主、稼働率", "hover または focus 時に表示し、viewport 外へはみ出さないよう位置を補正する。", "入力項目なし", "現場責任者・管理者", "固定座標で表示し、スクロール/リサイズに追従", "現在のページ配色に合わせた浅色デザイン。"),
            body_row("C-008", "管理者画面", "進捗管理", "進捗管理メイン", "業務フロー単位の進捗対象を一覧表示する画面。", "上部にフィルタ列 + 追加ボタン、下部に業務フローカードと業務テーブルを配置する。", "検索条件、進捗対象追加ボタン", "業務フローカード、業務行テーブル、要約カード", "フィルタは即時反映、追加ボタンで進捗対象追加モーダルを開く。", "入力必須は進捗対象追加モーダル側で検証する。", "管理者・計画担当", "横幅が狭い場合はテーブル優先で情報を詰める", "グルーピング色は現場配置と統一。"),
            body_row("C-009", "", "", "業務フローカード", "業務フロー単位の上位カード。", "ヘッダー行に業務フロー名、進捗率タグ、必要人時タグを配置し、下に KPI カード群を横一列に並べる。", "なし", "荷主数、業務フロー数、業務数、予定数、実績数、必要人時合計、出勤予定人時、過不足、不足人数", "カードヘッダー色は業務フロー単位で固定し、業務行テーブルと一体で見せる。", "入力項目なし", "管理者・計画担当", "カード内テーブルは横幅優先", "mini DAG は現行仕様に含めない。"),
            body_row("C-010", "", "", "業務テーブル", "個別業務の計画と実績を表示する表。", "業務セルの下に荷主・エリアタグ、予定時刻列に開始/終了入力、予定数入力、UPH表示、進捗セルに実績/予定とバーをまとめる。", "開始予定時刻、終了予定時刻、予定数", "UPH、必要人時、進捗率、見込み、状態", "予定数は直接編集し、進捗セルでは『実績/予定』『%』『見込み』を一体表示する。", "時刻は HH:MM、予定数は数値のみ。", "管理者・計画担当", "列を絞り、タグはセル内に収める", "残数列は独立表示しない。"),
            body_row("C-011", "", "", "進捗対象追加モーダル", "業務フローテンプレートから進捗対象を追加するモーダル。", "上部にテンプレート選択と一括入力、下部に業務別調整表を配置する。", "業務フローテンプレート、開始/終了、予定数、UPH、エリア", "テンプレート由来の業務一覧、推奨人数、前業務", "表下の『追加』ボタンで入力行を開き、業務追加・削除・並び替え・前業務設定を行う。", "前業務は表内に存在する業務のみ選択可能。", "管理者・計画担当", "モーダルは広幅、横スクロール抑制", "荷主は表内列で調整する。"),
            body_row("C-012", "", "", "進捗推移モーダル", "単一業務の推移確認用モーダル。", "上部に概要、下部にチャート/時系列情報を配置する。", "なし", "予定数、実績数、残件数、見込み時刻", "業務行から起動し、閉じるまでは対象業務を固定表示する。", "入力項目なし", "管理者・計画担当", "モーダル内スクロールあり", "単位はすべて『件』で統一。"),
            body_row("C-013", "管理者画面", "シフト管理", "シフト管理メイン", "シフト表、作業日ビュー、テンプレートの 3 タブ構成。", "タブ列の右端にシフト表タブ専用のインポート/エクスポート/保存ボタンを配置する。", "タブ切替、月移動、対象日切替", "月次表、作業日ビュー、テンプレートカード", "シフト表タブ時のみ運用ボタンを表示する。", "テンプレートタブではカテゴリごとにテンプレートを管理する。", "計画担当・管理者", "タブに応じてレイアウトを切り替える", "タイトルや説明文は画面上部に置かない。"),
            body_row("C-014", "", "", "シフト表", "月次シフトを表形式で編集する。", "左に作業者固定列、右に日付列、下に出勤人数と人時の集計行を配置する。", "各セルの勤務テンプレート、複数セル選択", "日付、曜日、勤務時間、出勤人数、人時", "単一セルクリックでポップオーバー、一括選択時は一括設定バーを表示する。空白クリックでポップオーバーを閉じる。", "日付別編集は月内のみ。", "計画担当・管理者", "週末と祝日は文字色で識別し背景は変えない", "非出勤は空表示。"),
            body_row("C-015", "", "", "作業日ビュー", "24 時間の需給チャート。", "上部に 5 枚のサマリーカード、下部に bar + line チャートと逼迫時間帯リストを配置する。", "対象日、粒度 15分/30分/1時間", "必要人数、出勤人数、過不足、必要人時合計、出勤予定人時、不足人数", "粒度切替でチャート再集計、対象日切替で日次集計を更新する。", "粒度は選択肢のみ。", "計画担当・管理者", "フル幅表示、24 時間固定軸", "必要人数は UPH を考慮。"),
            body_row("C-016", "", "", "テンプレート管理タブ", "勤務テンプレートをカテゴリ別カードで管理する。", "カテゴリごとの折りたたみグループ内にテンプレートカードを並べる。", "テンプレート名、開始、終了、色、休憩", "カテゴリ、表示名、時間表示、休憩一覧", "テンプレート追加・編集・削除をカード右端の操作アイコンで行う。", "開始 < 終了を基本とし、跨日シフトは別扱いで許容する。", "計画担当・管理者", "カード内情報を縦に詰める", "休憩テンプレート一覧は独立表示しない。"),
            body_row("C-017", "", "", "セル編集ポップオーバー", "単一シフトセル編集用の小型 popover。", "上半分にテンプレート快選、下半分に開始/終了/休憩編集と勤務チェックを配置する。", "テンプレート、開始、終了、休憩名、休憩開始、休憩終了", "勤務時間、休憩時間、深夜勤務、休憩不足警告", "テンプレート選択後に手動で時刻・休憩を微調整し、保存で反映する。", "削除ボタンは置かず、休憩は追加と編集のみ。", "計画担当・管理者", "内容が増えてもコンパクトに収まるよう max-height を持つ", "当日調整タブは現行仕様に含めない。"),
            body_row("C-018", "", "", "一括設定バー", "複数セル選択時に表示される一括編集バー。", "テンプレート快選、開始/終了入力、休憩編集、勤務チェック、一括適用ボタンを横方向に整理する。", "テンプレート、開始、終了、休憩名、休憩開始、休憩終了", "対象セル数、勤務チェック結果", "選択中セルへ同じ設定をまとめて適用する。", "対象セルが 0 件の時は表示しない。", "計画担当・管理者", "横幅不足時は休憩編集部が縦積みになる", "一括設定でも休憩手動調整を許可。"),
            body_row("C-019", "管理者画面", "送信実績", "送信実績一覧", "送信ログを集約・展開できる一覧画面。", "上部にフィルタ列、下部に集約テーブルを配置する。", "作業期間、作業者、荷主、業務、工程、状態、ランク", "荷主、業務、工程、開始/終了、所要時間、UPH、状態、ランク", "集約行先頭の +/− で明細を開閉する。", "期間は開始日 <= 終了日。", "管理者・分析担当", "テーブルはカード内に収める", "説明文やタイトルカードは置かない。"),
            body_row("C-020", "", "", "送信明細展開", "集約行の下に出る送信回次明細。", "親行の直下に子テーブルを差し込む。", "なし", "送信時刻、送信数、累計、状態", "1 回送信の行でも展開ボタンを表示し、必ず明細を見られるようにする。", "入力項目なし", "管理者・分析担当", "親列と幅を合わせる", ""),
            body_row("C-021", "管理者画面", "マスタ管理", "マスタ管理メイン", "タブで各種マスタを切り替える。", "上部に丸角タブ、同一行に検索/絞り込み/追加ボタン、下部にカード化した一覧テーブルを配置する。", "検索、ステータス絞り込み、追加ボタン", "荷主、拠点、業務、業務フロー、資格、スキル、派遣会社", "追加/編集はモーダルを起点とし、行内直接編集は行わない。", "必須項目不足時は保存不可。", "管理者", "他ページと同じ幅・余白基準を採用", "初期データリセットは表示しない。"),
            body_row("C-022", "", "", "マスタ編集モーダル", "各マスタ共通の追加/編集ダイアログ。", "タイトル、説明、入力フォーム、保存/キャンセルの単純構成。", "マスタ種別ごとの項目", "既存値、関連条件、色・アイコン選択", "編集アイコンから起動し、保存で一覧へ即反映する。", "モーダル内入力の必須・形式チェックを行う。", "管理者", "内容に応じて幅を可変", "資格アイコン選択は portal でクリップ回避。"),
            body_row("C-023", "管理者画面", "ユーザー管理", "ユーザー管理メイン", "ユーザー、ロール、チームをタブで管理する。", "上部にタブ、集計カード、フィルタ列。下部に一覧テーブルとモーダル編集を組み合わせる。", "検索、ロール、ステータス、雇用形態、スキル/資格絞り込み", "ユーザー一覧、ロール一覧、チーム一覧", "追加/編集は共通モーダル、一覧クリックでも編集を開く。", "メール形式、必須入力、チーム単一所属を検証する。", "管理者", "フィルタは 1 行表示、テーブル幅は上部カードと合わせる", "詳細サイドパネルではなくモーダル中心。"),
            body_row("C-024", "", "", "ユーザー編集モーダル", "ユーザー追加と編集を兼用するダイアログ。", "基本情報グリッド、ロール多選、資格/スキル、多段情報カードで構成する。", "氏名、メール、雇用形態、単価、派遣会社、チーム、付与ロール", "資格、スキル、チーム色、ステータス", "保存時にチーム単一所属を保証し、チーム色を icon へ反映する。", "派遣会社とチームは選択肢のみ。", "管理者", "モーダルはカード調で統一", "チーム未所属 icon は灰色。"),
            body_row("C-025", "", "", "チームタブ", "管理チームの一覧と編集。", "一覧テーブル + 追加/編集モーダルで構成する。", "チーム名、テーマ色、メンバー", "メンバー人数、テーマ色、説明", "テーマ色を設定すると所属ユーザー icon に反映する。", "同一ユーザーの複数チーム所属は不可。", "管理者", "チーム色は一覧内でも視認可能にする", ""),
            body_row("C-026", "管理者画面", "通知管理", "通知一覧画面", "通知の一覧と既読状態管理を行う。", "検索・フィルタ付きテーブルと詳細領域の 2 段構成。", "レベル、対象、日付、既読状態", "件名、本文、発生時刻、対象者", "一覧行クリックで詳細を開き、既読を更新する。", "既読/未読は列挙値のみ。", "管理者", "カードトーンは他管理画面と統一", ""),
            body_row("C-027", "管理者画面", "拠点詳細", "拠点詳細タブ", "基本情報、荷主管理、設備・レイアウト、設定をタブで分ける。", "上部タブ + 各タブ内容の構成。設備・レイアウト内で区域管理を行う。", "拠点基本情報、荷主追加、区域追加", "荷主一覧、区域一覧、設定項目", "荷主カード/ダイアログ、区域 CRUD を行う。", "拠点選択必須。", "管理者", "他ページと同じカードスタイル", "作業単価体系ブロックは現行仕様に含めない。"),
            body_row("C-028", "作業者画面", "作業者タスク", "作業者タスクカード", "作業者本人向けに現在担当と次担当を見せる画面。", "縦カード内にヘッダー、現在配置、次配置、稼働率、担当タグを配置する。", "なし", "氏名、状態、現在担当、次担当、残時間、稼働率", "担当更新に応じてカード内容を自動更新する。", "入力項目なし", "作業者本人", "モバイル幅を優先", "深色カードデザイン。"),
            body_row("C-029", "", "バンドビュー", "作業者帯表示", "複数作業者の担当帯を横断表示する画面。", "時間軸上に作業者行を積み上げる。", "なし", "担当帯、状態、時間軸", "時間帯変更に応じて担当帯を更新する。", "入力項目なし", "管理者・現場責任者", "横スクロール前提", ""),
        ),
    ),
    SheetData(
        kind="data",
        name="Part D データ",
        title="Part D - データ仕様編（開発会社向け中心）",
        subtitle="対象版: 2026-03-30 時点の現行仕様",
        headers=("No.", "大分類", "中分類", "データ名", "概要", "主項目", "リレーション", "保存先", "外部I/F", "備考"),
        widths=(10, 14, 18, 22, 28, 40, 28, 18, 18, 22),
        rows=(
            body_row("D-001", "マスタ", "拠点", "Site", "物流拠点の基本情報を保持する。", "siteId, name, address, status, layoutAreas", "1 Site - n LayoutArea / n Workflow / n Shipper", "localStorage + Context", "なし", "トップバー選択の基準データ。"),
            body_row("D-002", "", "区域", "LayoutArea", "拠点配下の区域情報を保持する。", "areaId, siteId, name, description", "n LayoutArea - n WorkflowStepSetting", "Site 内包データ", "なし", "独立マスタではなく拠点配下で管理。"),
            body_row("D-003", "", "荷主", "Shipper", "荷主マスタの登録・状態・連絡先を保持する。", "shipperId, name, status, code, contactPerson, notes", "n Shipper - n Site / n Workflow", "localStorage + Context", "WMS 連携候補", "荷主マスタではコード列を UI 表示しない。"),
            body_row("D-004", "", "業務", "Business Master", "単一業務の基本定義を保持する。", "businessId, name, description, defaultUph, qualificationIds, skillIds", "n Business - n WorkflowStepSetting", "localStorage + Context", "なし", "UI 上の『業務』単位。"),
            body_row("D-005", "", "業務フロー", "Workflow", "複数業務を束ねた業務フロー定義を保持する。", "workflowId, siteId, name, stepIds, active", "1 Workflow - n WorkflowStepSetting", "localStorage + Context", "なし", "進捗対象追加と現場配置の基準。"),
            body_row("D-006", "", "業務詳細", "WorkflowStepSetting", "業務フロー配下の各業務詳細を保持する。", "stepId, workflowId, businessId, name, uph, startTime, endTime, layoutAreaIds, qualificationIds, skillIds, predecessorStepIds", "n Step - n LayoutArea / n Qualification / n Skill", "localStorage + Context", "なし", "前業務設定と UPH を保持。"),
            body_row("D-007", "", "資格", "Qualification", "資格マスタと表示アイコンを保持する。", "qualificationId, name, icon, notes", "n Qualification - n User / n WorkflowStepSetting", "localStorage + Context", "なし", "編集はモーダル。"),
            body_row("D-008", "", "スキル", "Skill", "スキルマスタを保持する。", "skillId, name, notes", "n Skill - n User / n WorkflowStepSetting", "localStorage + Context", "なし", "既定スキルは多選入力。"),
            body_row("D-009", "", "派遣会社", "Dispatch Company", "派遣会社情報を保持する。", "companyId, name, contact, status", "1 Dispatch Company - n User", "localStorage + Context", "将来人材供給 I/F 候補", "派遣比率と単価に利用。"),
            body_row("D-010", "計画", "進捗計画", "Progress Plan", "進捗管理で編集する計画値を保持する。", "workflowId, stepId, planned, actual, expectedFinish, status", "Workflow / WorkflowStepSetting に紐づく", "localStorage store", "WMS 実績連携候補", "予定数編集と見込み計算に使用。"),
            body_row("D-011", "", "現場配置", "Field Deployment Snapshot", "現在時点の配置状態を保持する。", "assignedWorkers, splitUnits, areaId, shipperId, start, end", "User / WorkflowStepSetting と関連", "localStorage store", "なし", "current assignment / next assignment 計算に使用。"),
            body_row("D-012", "", "シフトテンプレート", "ShiftTemplate", "勤務テンプレートを保持する。", "templateId, category, name, color, start, end, breaks[]", "n ShiftTemplate - n ShiftData", "localStorage store", "なし", "カテゴリ別に管理。"),
            body_row("D-013", "", "月次シフト", "ShiftData", "ユーザー別・日付別の勤務予定を保持する。", "userId, date, start, end, templateId, breaks[]", "1 User - n ShiftData", "localStorage store", "勤怠状態同期の参照元", "休憩はセル編集と一括設定から調整。"),
            body_row("D-014", "勤怠", "勤怠状態同期", "Attendance Status I/F", "外部勤怠システムから受け取る最小状態同期。", "userId, date, attendanceStatus", "ShiftData / User と関連", "外部入力想定", "勤怠システム", "出勤済み・未出勤・欠勤の 3 状態を想定。"),
            body_row("D-015", "ユーザー", "ユーザー", "User", "ユーザーの基本プロフィールと業務属性を保持する。", "userId, name, email, employmentType, teamId, roleIds, qualificationIds, skillIds, unitPrice, dispatchCompanyId", "Team / Role / Qualification / Skill / Dispatch Company と関連", "localStorage + Context", "認証 I/F は一部 Supabase 基盤あり", "1 人 1 チーム。"),
            body_row("D-016", "", "チーム", "Team", "管理チームの名称、色、メンバーを保持する。", "teamId, name, color, memberUserIds, notes", "1 Team - n User", "localStorage + Context", "なし", "現場配置 icon 色へ反映。"),
            body_row("D-017", "", "ロール", "Role", "ロールと権限群を保持する。", "roleId, name, permissionKeys", "n Role - n User", "localStorage + Context", "なし", "ユーザー付与ロールは多選。"),
            body_row("D-018", "通知", "通知", "Notification", "通知一覧用の通知データを保持する。", "notificationId, title, message, level, targetUserIds, createdAt, readBy", "User と論理関連", "localStorage store", "将来 push 連携候補", "既読管理を保持。"),
            body_row("D-019", "実績", "送信実績", "Submission Record", "送信実績と予定差分を保持する。", "recordId, workerId, shipperId, workflowId, stepId, plannedStart, plannedEnd, actualStart, actualEnd, quantity, status", "User / Workflow / Shipper と関連", "localStorage store", "WMS 連携候補", "集約行と明細行の元データ。"),
            body_row("D-020", "外部連携", "WMS", "WMS I/F", "実績数と送信実績を受け渡す想定インターフェース。", "荷主別件数、業務別件数、送信実績", "Progress Plan / Submission Record と関連", "外部入力想定", "WMS", "現行 UI は store 直接参照を前提。"),
            body_row("D-021", "", "Supabase", "Supabase 接続基盤", "認証や将来 API 化に備えた接続基盤。", "VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY", "認証/データ API へ拡張余地あり", "環境変数", "Supabase", "現行機能は全面的な API 化には至っていない。"),
            body_row("D-022", "", "API 現況", "内部データアクセス方針", "現時点の画面は主に store 直接参照で構築されている。", "Context, localStorage store, selector functions", "画面コンポーネントと直接接続", "フロントエンド内", "未定義の REST API は持たない", "API 未整備は『現行は store 直接参照』と明記する。"),
        ),
    ),
    SheetData(
        kind="nonfunctional",
        name="Part E 非機能",
        title="Part E - 非機能・運用編",
        subtitle="対象版: 2026-03-30 時点の現行仕様",
        headers=("No.", "大分類", "中分類", "要件名", "要求内容", "現行対応", "運用ルール", "制約", "備考"),
        widths=(10, 14, 18, 22, 36, 28, 24, 24, 20),
        rows=(
            body_row("E-001", "非機能", "性能", "操作応答性", "主要画面で日次運営に支障がない操作速度を維持する。", "カード表示、表表示、hover カード、モーダル表示をクライアント側再計算で実現している。", "大量データ投入時は画面ごとに確認し、必要に応じてデータ件数上限を設ける。", "Vite build 上は大きな chunk warning が残る。", "現行は UX 確保を優先。"),
            body_row("E-002", "", "性能", "24 時間需給表示", "作業日ビューは 24 時間軸で必要人数と出勤人数を表示する。", "00:00-24:00 固定軸でチャートと集計カードを表示する。", "夜勤を含む運用では跨日データを確認する。", "前業務可処理量までは未反映。", ""),
            body_row("E-003", "", "操作性", "UI 一貫性", "主要管理画面でカード、余白、ボタン色、モーダル構造を統一する。", "マスタ管理、ユーザー管理、シフト管理、進捗管理、現場配置でデザイン基準を揃えている。", "新画面追加時も primary 色、カード余白、モーダル構造を踏襲する。", "一部旧画面に調整余地あり。", ""),
            body_row("E-004", "", "可用性", "ローカル保存", "ブラウザ再読込後も主要データを復元できること。", "Context と localStorage store でマスタ、シフト、進捗、配置、通知を保持する。", "保存キー変更時は移行や初期化を明示する。", "ブラウザ/端末依存でデータ消失の可能性がある。", ""),
            body_row("E-005", "", "セキュリティ", "認証・認可", "閲覧/操作権限をロールで管理する。", "画面側でログイン状態とロールを前提に表示制御する。Supabase 接続基盤はあるが、全面的なサーバー認可は未完了。", "機密情報は Excel・UI・ログへ出さない。", "現行はフロント中心の検証段階。", ""),
            body_row("E-006", "", "セキュリティ", "機密情報管理", "環境変数や鍵情報を仕様書に含めない。", "Preview/Production の URL や publishable key は運用者のみ管理する。", "共有資料では URL 共有範囲を明示する。", "本仕様書は秘密情報を扱わない。", ""),
            body_row("E-007", "インフラ", "構成", "フロントエンド配備", "フロントエンドは Vercel Preview/Production で配備する。", "Preview URL を dev 環境として共有し、検証用 Supabase 設定を Preview に割り当てる。", "Preview と Production の設定差分は運用者が管理する。", "固定の生成 URL は deployment ごとに変わる。", ""),
            body_row("E-008", "", "構成", "開発環境", "ローカル開発環境を保持する。", "Vite 開発サーバーでローカル確認し、必要に応じて Preview へ反映する。", "重要変更は build 通過後に push / deploy する。", "Windows + PowerShell 前提の運用が多い。", ""),
            body_row("E-009", "", "環境定義", "環境差分管理", "dev / preview / production の環境差分を明確化する。", "Supabase URL と publishable key を環境変数で切り替える。", "Preview 環境は非本番 DB を使う。", "branch 固定 preview は必須ではない。", ""),
            body_row("E-010", "運用", "データ運用", "マスタ更新運用", "拠点、荷主、業務、業務フロー、ユーザー、チームなどの更新責任を明確にする。", "現行 UI では各マスタをモーダル経由で追加/編集する。", "重要変更は PRD と仕様書へ同期反映する。", "履歴管理や承認フローは未実装。", ""),
            body_row("E-011", "", "データ運用", "シフト運用", "計画シフトと当日可用人数の連携を保つ。", "シフト表の予定と、作業日ビューの必要人数・出勤人数比較を同一製品内で扱う。", "勤怠システムからは出勤済み・未出勤・欠勤の状態同期のみを受ける想定とする。", "遅刻理由や詳細勤怠計算は責務外。", ""),
            body_row("E-012", "", "リリース運用", "Preview 配布", "顧客確認用 Preview を共有できる状態を保つ。", "Vercel Preview を用いて個別 URL を発行し、必要に応じて公開設定を変更する。", "顧客共有時は対象環境と目的を明示する。", "同一生成 URL の上書きはできない。", ""),
            body_row("E-013", "制約", "ブラウザ要件", "推奨ブラウザ", "最新 Chrome 系ブラウザを推奨とする。", "drag&drop、hover card、table scroll を Chrome 系で検証している。", "運用端末の標準ブラウザを定める。", "他ブラウザは要追加検証。", ""),
            body_row("E-014", "", "端末要件", "対応端末", "管理画面はデスクトップ中心、作業者画面はモバイルも対象とする。", "管理画面は広い表とカードを含むため横幅を必要とし、作業者画面はモバイル幅を優先する。", "現場端末の種類に応じて表示確認を行う。", "全画面を完全に同一 UX で提供することは前提にしない。", ""),
            body_row("E-015", "", "既知制限", "サーバー API 未整備", "現行実装は store 直接参照が中心であり、全面的な API 仕様は未整備である。", "UI とデータ構造は先行整備し、将来 API 化しやすい粒度でモデルを保持している。", "外部 I/F 実装時は Part D のデータ定義を起点に API 設計を追加する。", "今回の仕様書では最新仕様のみを扱う。", ""),
        ),
    ),
)


def priority_style(value: str) -> int:
    if value == "高":
        return STYLE_PRIORITY_HIGH
    if value == "中":
        return STYLE_PRIORITY_MEDIUM
    return STYLE_PRIORITY_LOW


def status_style(value: str) -> int:
    if value == "現行":
        return STYLE_STATUS_CURRENT
    if value in {"一部暫定", "設計中", "要拡張"}:
        return STYLE_STATUS_WARNING
    return STYLE_STATUS_PENDING


def body_style(sheet: SheetData, header: str, column_index: int, value: str) -> int:
    if column_index in {0, 1, 2}:
        return STYLE_HIERARCHY
    if sheet.kind == "function" and header == "優先度":
        return priority_style(value)
    if sheet.kind == "function" and header == "フェーズ":
        return STYLE_PHASE
    if sheet.kind == "function" and header == "ステータス":
        return status_style(value)
    return STYLE_BODY


def build_sheet_xml(sheet: SheetData) -> str:
    column_count = len(sheet.headers)
    last_col = col_letter(column_count)
    rows_xml: list[str] = []

    def make_row(row_index: int, values: tuple[str, ...], styles: tuple[int, ...], height: int) -> str:
        cells = []
        for column_index, (value, style_id) in enumerate(zip(values, styles, strict=True), start=1):
            cells.append(inline_cell(f"{col_letter(column_index)}{row_index}", value, style_id))
        return f'<row r="{row_index}" ht="{height}" customHeight="1">{"".join(cells)}</row>'

    rows_xml.append(make_row(1, (sheet.title,), (STYLE_TITLE,), 28))
    rows_xml.append(make_row(2, (sheet.subtitle,), (STYLE_SUBTITLE,), 20))
    rows_xml.append(make_row(3, sheet.headers, tuple(STYLE_HEADER for _ in sheet.headers), 34))

    current_row = 4
    for row in sheet.rows:
        styles = tuple(body_style(sheet, header, idx, row[idx]) for idx, header in enumerate(sheet.headers))
        rows_xml.append(make_row(current_row, row, styles, 42))
        current_row += 1

    cols_xml = "".join(
        f'<col min="{idx}" max="{idx}" width="{width}" customWidth="1"/>'
        for idx, width in enumerate(sheet.widths, start=1)
    )
    last_row = current_row - 1
    auto_filter_ref = f"A3:{last_col}{last_row}"
    return (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" '
        'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
        f'<dimension ref="A1:{last_col}{last_row}"/>'
        '<sheetViews><sheetView workbookViewId="0"><pane ySplit="3" topLeftCell="A4" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A4" sqref="A4"/></sheetView></sheetViews>'
        '<sheetFormatPr defaultRowHeight="22"/>'
        f"<cols>{cols_xml}</cols>"
        f'<sheetData>{"".join(rows_xml)}</sheetData>'
        f'<autoFilter ref="{auto_filter_ref}"/>'
        "</worksheet>"
    )


def build_workbook_xml() -> str:
    sheets_xml = "".join(
        f'<sheet name="{escape(sheet.name)}" sheetId="{idx}" r:id="rId{idx}"/>'
        for idx, sheet in enumerate(SHEETS, start=1)
    )
    return (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" '
        'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
        '<bookViews><workbookView xWindow="240" yWindow="90" windowWidth="18000" windowHeight="9800"/></bookViews>'
        f"<sheets>{sheets_xml}</sheets>"
        "</workbook>"
    )


def build_styles_xml() -> str:
    return """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="5">
    <font><sz val="11"/><name val="Yu Gothic UI"/><family val="2"/></font>
    <font><b/><sz val="16"/><name val="Yu Gothic UI"/><family val="2"/><color rgb="FF1F2937"/></font>
    <font><sz val="11"/><name val="Yu Gothic UI"/><family val="2"/><color rgb="FF475569"/></font>
    <font><b/><sz val="11"/><name val="Yu Gothic UI"/><family val="2"/><color rgb="FFFFFFFF"/></font>
    <font><b/><sz val="11"/><name val="Yu Gothic UI"/><family val="2"/><color rgb="FF111827"/></font>
  </fonts>
  <fills count="11">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF2F5597"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFF2F6FC"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFFDE7E9"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFFFF4DA"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFE9F7EF"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFE2F0E8"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFE8F5EE"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFFFF3CD"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFF3F4F6"/><bgColor indexed="64"/></patternFill></fill>
  </fills>
  <borders count="2">
    <border><left/><right/><top/><bottom/><diagonal/></border>
    <border><left style="thin"><color rgb="FFD1D5DB"/></left><right style="thin"><color rgb="FFD1D5DB"/></right><top style="thin"><color rgb="FFD1D5DB"/></top><bottom style="thin"><color rgb="FFD1D5DB"/></bottom><diagonal/></border>
  </borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="13">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment horizontal="left" vertical="center"/></xf>
    <xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment horizontal="left" vertical="center"/></xf>
    <xf numFmtId="0" fontId="3" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="top" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="4" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="top" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="4" fillId="4" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="4" fillId="5" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="4" fillId="6" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="4" fillId="7" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="4" fillId="8" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="4" fillId="9" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="4" fillId="10" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
  </cellXfs>
  <cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>
"""


def build_content_types_xml() -> str:
    overrides = [
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>',
        '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>',
        '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>',
        '<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>',
    ]
    for idx in range(1, len(SHEETS) + 1):
        overrides.append(
            f'<Override PartName="/xl/worksheets/sheet{idx}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
        )
    return (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
        '<Default Extension="xml" ContentType="application/xml"/>'
        f'{"".join(overrides)}'
        "</Types>"
    )


def build_root_rels_xml() -> str:
    return """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>
"""


def build_workbook_rels_xml() -> str:
    relationships = [
        f'<Relationship Id="rId{idx}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet{idx}.xml"/>'
        for idx in range(1, len(SHEETS) + 1)
    ]
    relationships.append(
        f'<Relationship Id="rId{len(SHEETS) + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>'
    )
    return (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        f'{"".join(relationships)}'
        "</Relationships>"
    )


def build_core_xml() -> str:
    now = datetime.now().strftime("%Y-%m-%dT%H:%M:%S")
    return f"""<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:title>FluxView specification structure</dc:title>
  <dc:creator>OpenAI Codex</dc:creator>
  <cp:lastModifiedBy>OpenAI Codex</cp:lastModifiedBy>
  <dcterms:created xsi:type="dcterms:W3CDTF">{now}Z</dcterms:created>
  <dcterms:modified xsi:type="dcterms:W3CDTF">{now}Z</dcterms:modified>
</cp:coreProperties>
"""


def build_app_xml() -> str:
    titles = "".join(f"<vt:lpstr>{escape(sheet.name)}</vt:lpstr>" for sheet in SHEETS)
    return f"""<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
  <Application>Microsoft Excel</Application>
  <HeadingPairs>
    <vt:vector size="2" baseType="variant">
      <vt:variant><vt:lpstr>Worksheets</vt:lpstr></vt:variant>
      <vt:variant><vt:i4>{len(SHEETS)}</vt:i4></vt:variant>
    </vt:vector>
  </HeadingPairs>
  <TitlesOfParts>
    <vt:vector size="{len(SHEETS)}" baseType="lpstr">{titles}</vt:vector>
  </TitlesOfParts>
  <AppVersion>16.0300</AppVersion>
</Properties>
"""


def write_workbook(path: Path) -> None:
    with zipfile.ZipFile(path, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("[Content_Types].xml", build_content_types_xml())
        zf.writestr("_rels/.rels", build_root_rels_xml())
        zf.writestr("docProps/core.xml", build_core_xml())
        zf.writestr("docProps/app.xml", build_app_xml())
        zf.writestr("xl/workbook.xml", build_workbook_xml())
        zf.writestr("xl/styles.xml", build_styles_xml())
        zf.writestr("xl/_rels/workbook.xml.rels", build_workbook_rels_xml())
        for idx, sheet in enumerate(SHEETS, start=1):
            zf.writestr(f"xl/worksheets/sheet{idx}.xml", build_sheet_xml(sheet))


def build_output_path() -> Path:
    if len(sys.argv) > 1:
        return Path(sys.argv[1]).resolve()
    return Path(__file__).resolve().parent / OUTPUT_NAME


def fallback_path(path: Path) -> Path:
    return path.with_name(f"{path.stem}{FALLBACK_SUFFIX}{path.suffix}")


def main() -> None:
    target_path = build_output_path()
    try:
        write_workbook(target_path)
        actual_path = target_path
    except PermissionError:
        actual_path = fallback_path(target_path)
        write_workbook(actual_path)
    print(f"Created: {actual_path}")


if __name__ == "__main__":
    main()

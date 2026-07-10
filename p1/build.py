#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""ビルドID自動刻印+回帰ゲート(DEVELOPMENT_RULES §3)
使い方: python3 build.py p1-004(平坦配置版)
  1. VERSION.txt の現IDを新IDへ全ファイル一括置換(箇所数を検証)
  2. node run_node.js で106件回帰を実行(失敗ならIDを戻して中止)
"""
import re, subprocess, sys, os
ROOT = os.path.dirname(os.path.abspath(__file__))  # 平坦配置: build.pyも直下
# 刻印対象と期待箇所数(ファイル追加時はここを更新)
SPOTS = {
    'index.html': 10,          # BUILD_HTML + css + js×8
    'dummy.html': 10,
    'board_sandbox.html': 5,   # BUILD_HTML + css + js×3
    'style.css': 1,
    'boot.js': 1,
    'core_data.js': 1,
    'engine.js': 1,
}

def main():
    if len(sys.argv) != 2 or not re.fullmatch(r'p\d+-\d{3}', sys.argv[1]):
        print('使い方: python3 build.py p1-004(平坦配置版)'); sys.exit(2)
    new = sys.argv[1]
    vfile = os.path.join(ROOT, 'VERSION.txt')
    cur = open(vfile).read().strip()
    if cur == new:
        print(f'既に {new} です'); sys.exit(2)
    # 第1段: 全ファイルを書き込まずに検証(1つでも不一致なら何も変更しない)
    backup = {}
    errors = []
    for f, want in SPOTS.items():
        p = os.path.join(ROOT, f)
        t = open(p, encoding='utf-8').read()
        n = t.count(cur)
        if n != want:
            errors.append(f'{f}: {cur}が{n}箇所(期待{want})')
        backup[p] = t
    if errors:
        print('!!! 刻印前検証で不一致(ファイルは未変更):')
        for e in errors: print('   ' + e)
        print('SPOTS表の更新、またはコメント等への版番号混入を確認してください')
        sys.exit(1)
    # 第2段: 検証合格後に一括書き込み
    for p, t in backup.items():
        open(p, 'w', encoding='utf-8').write(t.replace(cur, new))
    print(f'刻印 {cur} → {new} ({sum(SPOTS.values())}箇所)')
    r = subprocess.run(['node', os.path.join(ROOT, 'run_node.js')], capture_output=True, text=True)
    ok = r.returncode == 0 and 'FAIL 0' in r.stdout
    tail = [l for l in r.stdout.splitlines() if l.startswith('PASS')]
    print('回帰:', tail[-1] if tail else '出力なし')
    if not ok:
        for p, t in backup.items(): open(p, 'w', encoding='utf-8').write(t)
        print('!!! 回帰失敗のためIDを戻しました。デプロイ禁止'); sys.exit(1)
    open(vfile, 'w').write(new + '\n')
    print(f'完了: {new}(デプロイ可)')

if __name__ == '__main__':
    main()

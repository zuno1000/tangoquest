"""SRSの期待解答数(マルコフ連鎖)・v5.8.0の規則変更の根拠。python scripts/srs_cost.py で表を出す。
旧expAttempts(k回連続正解の公式)と、実際の規則(ミス→1段下へ復帰・既知語の早回し)の比較"""
def cost(p, rule, fast, pmassed=None):
    # state=(box, lb, clean). pmassed = recall prob for the 1min/10min re-asks (in-session), default p
    pm = p if pmassed is None else pmassed
    states=[(b,lb,c) for b in range(5) for lb in range(0,7) for c in (0,1)]
    E={s:0.0 for s in states}
    for _ in range(3000):
        N={}
        for (b,lb,c) in states:
            pr = pm if b<=1 else p
            # ok transition
            if fast and c and b==0: nb,nc=2,1
            elif fast and c and b==2: nb,nc=4,1
            else: nb,nc=min(max(b+1,lb),7),c
            e_ok = 0 if nb>=5 else E[(nb,0,nc)]
            # miss transition
            if rule=='half': nlb = max(1,b//2) if b>=3 else 0
            elif rule=='minus1': nlb = b-1 if b>=2 else 0
            elif rule=='minus1floor1': nlb = max(1,b-1) if b>=2 else 0
            elif rule=='60': nlb = max(2,math.ceil(b*0.6)) if b>=3 else (1 if b==2 else 0)
            e_miss = E[(0,nlb,0)]
            N[(b,lb,c)] = 1 + pr*e_ok + (1-pr)*e_miss
        E=N
    return E[(0,0,1)]
print("expected attempts per word to reach box5 (start unseen)")
print(f"{'p':>5} {'cur(half)':>10} {'minus1':>8} {'half+fast':>10} {'minus1+fast':>12} | massed p=0.9: {'cur':>6} {'minus1+fast':>12}")
for p in (0.5,0.6,0.7,0.8,0.9,0.96):
    print(f"{p:5.2f} {cost(p,'half',0):10.1f} {cost(p,'minus1',0):8.1f} {cost(p,'half',1):10.1f} {cost(p,'minus1',1):12.1f} | {cost(p,'half',0,0.9):16.1f} {cost(p,'minus1',1,0.9):12.1f}")

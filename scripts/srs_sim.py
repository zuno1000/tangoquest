"""LEXICAの出題(pickWord)+SRS(srsApply)を再現し、FSRS風の記憶モデルで1年間の学習を模擬する。
python scripts/srs_sim.py 0.3  (引数=既知語率)。v5.8.0の設計検討で使用(5分ほどかかる)"""
import random, math, sys, io
sys.stdout=io.TextIOWrapper(sys.stdout.buffer,encoding='utf-8',errors='replace')
D=864e5
INTERVALS=[60e3, 10*60e3, 1*D, 3*D, 7*D, 16*D, 35*D, 90*D]
MASTER=5
N=2582

def srs_apply(st, ok, now, V):
    # st=[box,due,cor,wrong,mastered,ws,lastcor,lapseBack, firstOk?]
    if ok:
        if st[1]>now and (st[2]+st[3])>0:
            st[2]+=1; st[5]=0; st[6]=now; return st
        first = (st[2]+st[3])==0
        if V.get('fast') and first:
            st[0]=2  # known-word fast track: first-sight correct -> 1 day
        elif V.get('fast') and st[0]==2 and st[3]==0 and st[2]==1:
            st[0]=4  # second consecutive correct (at 1d) with no miss -> 7 days
        else:
            st[0]=min(max(st[0]+1, st[7] or 0), len(INTERVALS)-1)
        st[7]=0; st[2]+=1; st[5]=0; st[6]=now
    else:
        b=st[0]
        lb=V.get('lapse','half')
        if lb=='half':
            if b>=3: st[7]=max(1, b//2)
        elif lb=='minus1':
            if b>=2: st[7]=b-1
        elif lb=='60':
            if b>=3: st[7]=max(2, math.ceil(b*0.6))
            elif b==2: st[7]=1
        st[0]=0; st[3]+=1; st[5]=(st[5] or 0)+1
    st[1]=now+INTERVALS[st[0]]
    return st

class Learner:
    def __init__(self, known_frac, rng):
        self.rng=rng
        self.known=[rng.random()<known_frac for _ in range(N)]
        self.S=[None]*N        # stability (days)
        self.last=[None]*N     # last exposure time (ms)
        self.diff=[math.exp(rng.gauss(0,0.6)) for _ in range(N)]
        self.S0=0.5
    def answer(self, i, now):
        """returns (correct, true_recall)"""
        r=self.rng
        if self.known[i]:
            ok = r.random()<0.97
            self.last[i]=now
            return ok
        if self.S[i] is None:
            ok = r.random()<0.25    # pure guess
            self.S[i]=self.S0*self.diff[i]   # learned from feedback
            self.last[i]=now
            return ok
        t=(now-self.last[i])/D
        R=0.9**(t/self.S[i])
        recalled = r.random()<R
        if recalled:
            if t < 0.1*self.S[i]: g=1.25       # massed re-ask: little gain
            else: g=2.0+2.0*(1-R)
            self.S[i]*=g
            ok=True
        else:
            self.S[i]=max(self.S0*self.diff[i], 0.4*self.S[i])
            ok = r.random()<0.25             # guessed right anyway?
        self.last[i]=now
        return ok

def simulate(V, days=365, perday=100, known_frac=0.3, seed=1, goal_days=365, sessions=(8,12.5,18,21.5), verbose=False):
    rng=random.Random(seed)
    L=Learner(known_frac, rng)
    words={}   # i -> st
    recent=[]
    day_new=0
    stats={'ans':0,'cor':0,'rev':0,'revcor':0,'preempt':0}
    unseen_set=set(range(N))
    for day in range(days):
        day_new=0
        per_s = perday//len(sessions)
        for si,h in enumerate(sessions):
            t0=day*D + h*3600e3
            for q in range(per_s):
                now=t0+q*8000   # 8 sec per question
                # --- pickWord ---
                due=[i for i,st in words.items() if st[1]<=now]
                fr=lambda a: ([x for x in a if x not in recent] or a)
                d=fr(due)
                u=list(unseen_set)
                # pNew
                if V.get('goal'):
                    daysleft=max(1, goal_days-day)
                    unseen=len(unseen_set)
                    nT = math.ceil(unseen/max(1, daysleft-10)) if unseen>0 else 0
                    pNew = 0.3 if (nT>0 and day_new<nT) else 0.0
                else:
                    pNew=0.2
                if V.get('throttle') is not None and len(due)>V['throttle']:
                    pNew=0.0
                if d and (not u or rng.random()>=pNew):
                    def urg(i):
                        st=words[i]; iv=INTERVALS[min(st[0],len(INTERVALS)-1)]
                        x=(now-st[1])/iv
                        if (st[5] or 0)>=2: x+=0.5
                        return x
                    d.sort(key=urg, reverse=True)
                    pool=d[:min(8,len(d))]
                    i=rng.choice(pool); isnew=False
                elif u:
                    i=rng.choice(u); isnew=True
                else:
                    seen=fr(list(words.keys()))
                    seen.sort(key=lambda i:(words[i][0], words[i][1]))
                    pool=seen[:min(10,len(seen))]
                    i=rng.choice(pool); isnew=False
                    stats['preempt']+=1
                # --- answer ---
                ok=L.answer(i, now)
                st=words.get(i)
                if st is None:
                    st=words[i]=[0,0,0,0,0,0,0,0]; unseen_set.discard(i); day_new+=1
                else:
                    stats['rev']+=1; stats['revcor']+=ok
                srs_apply(st, ok, now, V)
                if ok and st[0]>=MASTER and not st[4]: st[4]=1
                stats['ans']+=1; stats['cor']+=ok
                recent.append(i); recent=recent[-3:]
        if verbose and (day+1)%30==0:
            m=sum(1 for st in words.values() if st[0]>=MASTER)
            print(f"day{day+1}: mastered={m} seen={len(words)} due_end={sum(1 for st in words.values() if st[1]<=t0+3600e3)}")
    mastered=sum(1 for st in words.values() if st[0]>=MASTER)
    ever=sum(1 for st in words.values() if st[4])
    # true knowledge: words with S>=7d or known
    true_known=sum(1 for i in range(N) if L.known[i] and i in words) + sum(1 for i in range(N) if (not L.known[i]) and L.S[i] is not None and L.S[i]>=7)
    return dict(mastered=mastered, ever=ever, seen=len(words), true7d=true_known,
                recall=stats['revcor']/max(1,stats['rev']), acc=stats['cor']/stats['ans'], preempt=stats['preempt'],
                due_left=sum(1 for st in words.values() if st[1]<=days*D))

if __name__=="__main__":
    variants={
      'V0 current (no goal)': {},
      'V0 current (goal 1y)': {'goal':1},
      'V1 lapse minus1': {'lapse':'minus1'},
      'V1b lapse 60%': {'lapse':'60'},
      'V2 fast-track known': {'fast':1},
      'V3 throttle new (due>40)': {'throttle':40},
      'V2+V1b': {'fast':1,'lapse':'60'},
      'V2+V1b+V3': {'fast':1,'lapse':'60','throttle':40},
      'V2+V1b (goal 1y)': {'fast':1,'lapse':'60','goal':1},
    }
    kf=float(sys.argv[1]) if len(sys.argv)>1 else 0.3
    print(f"known_frac={kf} perday=100 days=365")
    for name,V in variants.items():
        rs=[simulate(V, known_frac=kf, seed=s) for s in (1,2)]
        avg=lambda k: sum(r[k] for r in rs)/len(rs)
        print(f"{name:28s} mastered={avg('mastered'):6.0f} everM={avg('ever'):6.0f} seen={avg('seen'):6.0f} true7d={avg('true7d'):6.0f} recall={avg('recall'):.2f} acc={avg('acc'):.2f} preempt={avg('preempt'):5.0f} dueLeft={avg('due_left'):5.0f}")

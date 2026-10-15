import pandas as pd, json
tv = pd.read_csv("backtest-data/tv_export.csv", encoding="utf-8-sig")
ent = tv[tv.Type.str.startswith("Entry")].set_index("Trade number"); ex = tv[tv.Type.str.startswith("Exit")].set_index("Trade number")
t = ent[["Date and time","Price USD"]].join(ex[["Date and time","Price USD","Signal"]], rsuffix="_x"); t.columns=["etime","eprice","xtime","xprice","sig"]
mine = pd.DataFrame(json.load(open("backtest-data/my_trades.json")))
sh=pd.Timedelta(hours=5,minutes=30)
mine["etime"]=pd.to_datetime(mine.entryTime,unit="s")+sh; mine["xtime"]=pd.to_datetime(mine.exitTime,unit="s")+sh
t["etime"]=pd.to_datetime(t.etime); t["xtime"]=pd.to_datetime(t.xtime)
m=t.reset_index().merge(mine,on="etime",how="outer",indicator=True)
b=m[m._merge=="both"]
ok=(b.xtime_x==b.xtime_y)
print("TV",len(t),"mine",len(mine),"entries matched",len(b),"exit time matched",ok.sum(),"exit price matched(1e-4)",((b.xprice-b.exitPrice).abs()<1e-4).sum())
print("TV final cum PnL%:",tv["Cumulative PnL %"].iloc[-2] if False else tv.sort_values("Trade number")["Cumulative PnL %"].iloc[-1])
bad=b[~ok]
print(bad[["etime","sig","xtime_x","xprice","exitReason","xtime_y","exitPrice"]].head(8).to_string())

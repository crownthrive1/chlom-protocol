#!/usr/bin/env python3
import argparse,json,os,urllib.error,urllib.parse,urllib.request
API='https://api.github.com'; PASS={'success','neutral','skipped'}
HOLD=('draft/hold','draft / hold','hold —','hold -','merge_authorized: false','merge authorized: false','not approved','must not merge','independent review')

def req(repo,token,method,path,body=None):
    r=urllib.request.Request(API+path,data=(json.dumps(body).encode() if body is not None else None),method=method)
    for k,v in {'Accept':'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28','Authorization':f'Bearer {token}'}.items(): r.add_header(k,v)
    if body is not None:r.add_header('Content-Type','application/json')
    try:
        with urllib.request.urlopen(r,timeout=30) as x:
            raw=x.read(); return json.loads(raw) if raw else None
    except urllib.error.HTTPError as e: raise RuntimeError(f'{method} {path} -> {e.code}: {e.read().decode("utf-8","replace")[:600]}')

def classify(repo,token,pr):
    text=f"{pr.get('title','')}\n{pr.get('body') or ''}".lower(); num=pr['number']; sha=pr['head']['sha']
    if pr.get('draft') or any(x in text for x in HOLD): return {'number':num,'title':pr.get('title'),'head_sha':sha,'disposition':'PRESERVE_HOLD','reasons':['draft or explicit governance/HOLD marker']}
    cmp=req(repo,token,'GET',f"/repos/{repo}/compare/{urllib.parse.quote(pr['base']['sha'],safe='')}...{urllib.parse.quote(sha,safe='')}")
    if int(cmp.get('ahead_by',0))==0:return {'number':num,'title':pr.get('title'),'head_sha':sha,'disposition':'CLOSE_REPRESENTED','reasons':['zero unique commits relative to current base']}
    checks=req(repo,token,'GET',f'/repos/{repo}/commits/{sha}/check-runs?per_page=100').get('check_runs',[])
    complete=[c for c in checks if c.get('status')=='completed']; failed=[c for c in complete if str(c.get('conclusion') or '').lower() not in PASS]
    if failed:return {'number':num,'title':pr.get('title'),'head_sha':sha,'disposition':'REPAIR_REQUIRED','reasons':[f'{len(failed)} exact-head nonpassing checks']}
    behind=int(cmp.get('behind_by',0))
    if behind>0:return {'number':num,'title':pr.get('title'),'head_sha':sha,'disposition':'RESTACK_REQUIRED','reasons':[f'{behind} commits behind current base']}
    detail=req(repo,token,'GET',f'/repos/{repo}/pulls/{num}'); governed=[c for c in complete if 'governed merge gate' in str(c.get('name') or '').lower() and str(c.get('conclusion') or '').lower() in PASS]; pending=[c for c in checks if c.get('status')!='completed']
    if detail.get('mergeable') is True and governed and not pending:return {'number':num,'title':pr.get('title'),'head_sha':sha,'disposition':'MERGE_CANDIDATE','reasons':['current, mergeable, governed gate passed, observed checks complete']}
    return {'number':num,'title':pr.get('title'),'head_sha':sha,'disposition':'OBSERVE','reasons':['insufficient mutation evidence']}

def main():
    p=argparse.ArgumentParser();p.add_argument('--repo',default=os.getenv('GITHUB_REPOSITORY',''));p.add_argument('--apply',action='store_true');p.add_argument('--max-mutations',type=int,default=10);p.add_argument('--output',default='penta-vergence-report.json');a=p.parse_args();token=os.getenv('GH_TOKEN') or os.getenv('GITHUB_TOKEN') or ''
    if not a.repo or not token:raise SystemExit('repo/token required')
    prs=req(a.repo,token,'GET',f'/repos/{a.repo}/pulls?state=open&per_page=100&sort=updated&direction=asc'); out=[]; mutations=0
    for pr in prs:
        d=classify(a.repo,token,pr)
        if a.apply and mutations<a.max_mutations and d['disposition']=='CLOSE_REPRESENTED':req(a.repo,token,'PATCH',f"/repos/{a.repo}/pulls/{d['number']}",{'state':'closed'});d['mutation']='close';mutations+=1
        elif a.apply and mutations<a.max_mutations and d['disposition']=='MERGE_CANDIDATE':
            r=req(a.repo,token,'PUT',f"/repos/{a.repo}/pulls/{d['number']}/merge",{'sha':d['head_sha'],'merge_method':'merge','commit_title':f"PentaVergence: merge PR #{d['number']}"});d['mutation']='merge';d['mutation_result']='merged' if r.get('merged') else r.get('message');mutations+=1 if r.get('merged') else 0
        out.append(d)
    summary={}
    for d in out:summary[d['disposition']]=summary.get(d['disposition'],0)+1
    report={'contract':'ct.penta.vergence.repository-report.v1','repository':a.repo,'apply':a.apply,'mutations':mutations,'summary':summary,'decisions':out}
    open(a.output,'w',encoding='utf-8').write(json.dumps(report,indent=2,sort_keys=True)+'\n');print(json.dumps({'repository':a.repo,'summary':summary,'mutations':mutations},sort_keys=True))
if __name__=='__main__':main()

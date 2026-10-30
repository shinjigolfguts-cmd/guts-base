"""Read-only URL health check. Never rewrites catalog facts or verification dates."""
import argparse, concurrent.futures, datetime, json, pathlib, urllib.request, urllib.error, time
ROOT=pathlib.Path(__file__).resolve().parent.parent

def classify(status, body, final_url):
    """Classify transport and page content separately; never infer closure."""
    text = body.lower()
    if 'dduser-challenge' in final_url.lower() or 'verify you are human' in text or 'checking your browser' in text:
        return 'verification_required'
    if any(x in body for x in ['只今メンテナンス中', 'ただいまメンテナンス中', 'ただいまメンテナンスのため']):
        return 'maintenance'
    if status in (404, 410):
        return 'not_found'
    if status == 429:
        return 'rate_limited'
    if status and 200 <= status < 300:
        return 'http_ok_content_unverified'
    return 'http_error'

def check(url):
    try:
        request=urllib.request.Request(url,headers={'User-Agent':'Mozilla/5.0 (compatible; GOLFGUTS-LinkCheck/1.1)'})
        with urllib.request.urlopen(request,timeout=15) as response:
            body=response.read(65536).decode('utf-8','replace')
            state=classify(response.status,body,response.url)
            return {'url':url,'status':response.status,'finalUrl':response.url,'reachable':state=='http_ok_content_unverified','state':state,'brokenLink':False}
    except urllib.error.HTTPError as exc:
        try: body=exc.read(65536).decode('utf-8','replace')
        except Exception: body=''
        state=classify(exc.code,body,exc.url)
        if exc.code in (301,302,303,307,308): state='redirect_error'
        return {'url':url,'status':exc.code,'reachable':False,'state':state,'brokenLink':state=='not_found','error':str(exc)[:250]}
    except Exception as exc:
        return {'url':url,'status':None,'reachable':False,'state':'transport_error','brokenLink':False,'error':str(exc)[:250]}

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output',default='reports/source-health.json')
    parser.add_argument('--urls',help='JSON list of catalog source URLs to recheck; default checks all')
    args=parser.parse_args()
    raw=(ROOT/'catalog.js').read_text()
    data=json.loads(raw[raw.index('['):raw.rindex(']')+1])
    urls=sorted(set(d['source'] for d in data))
    if args.urls:
        requested=json.loads(pathlib.Path(args.urls).read_text())
        if not isinstance(requested,list) or any(u not in urls for u in requested):raise ValueError('Requested URLs must be current catalog sources')
        urls=sorted(set(requested))
    results=[]
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        futures={pool.submit(check,url):url for url in urls}
        for future in concurrent.futures.as_completed(futures):
            results.append(future.result())
            if len(results)%25==0: print(f'Checked {len(results)}/{len(urls)} URLs',flush=True)
    results.sort(key=lambda r:r['url'])
    by_url={r['url']:r for r in results}
    categories={str(c):{'entries':sum(d['cat']==c for d in data),'reachable':sum(d['cat']==c and by_url.get(d['source'],{}).get('reachable',False) for d in data),'attempted':sum(d['cat']==c and d['source'] in by_url for d in data)} for c in sorted({d['cat'] for d in data})}
    report={'checkedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'scope':'Transport and maintenance/challenge classification only; browser evidence is separate. Not price, stock, image or full content verification','catalogModified':False,'fullCatalog':not bool(args.urls),'totalUrls':len(urls),'reachableUrls':sum(r['reachable'] for r in results),'categories':categories,'results':results}
    target=ROOT/args.output
    target.parent.mkdir(parents=True,exist_ok=True)
    target.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps({k:v for k,v in report.items() if k!='results'},ensure_ascii=False))
    # Nonzero is an editorial review signal, never permission to drop records.
    raise SystemExit(0 if all(r['reachable'] for r in results) else 2)
if __name__=='__main__':main()

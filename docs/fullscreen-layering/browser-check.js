async (page) => {
  await page.goto('http://localhost:3000/login', {waitUntil:'domcontentloaded',timeout:15000});
  let calls=0, bulkCalls=0;
  await page.route('**/__task_flow_review/bootstrap', route => { calls++; return route.fulfill({json:{
    project:{id:987654,identifier:'review-fixture',name:'Review fixture'},
    trackers:[{id:1,name:'Task',default_status_id:1,allowed_status_ids:[1],disabled_core_fields:[],custom_fields:[]}],
    statuses:[{id:1,name:'New',is_default:true}],priorities:[{id:2,name:'Normal',is_default:true}],
    assignable_users:[],versions:[],current_user_id:987654
  }}); });
  await page.route('**/__task_flow_review/bulk', route => {
    bulkCalls++;
    if(bulkCalls===1) return route.fulfill({status:422,json:{errors:[{temp_id:null,messages:['Review fixture error']}]}});
    const data=route.request().postDataJSON();
    return route.fulfill({status:201,json:{issues:data.issues.map((n,i)=>({temp_id:n.temp_id,id:900000+i,start_date:n.start_date,due_date:n.due_date})),relations:[]}});
  });
  await page.evaluate(() => {
    localStorage.removeItem('task_flow_draft_v1_987654_987654');
    const root=document.createElement('div');
    root.id='redmine-task-flow-root'; root.className='task-flow-root';
    root.dataset.bootstrapUrl='/__task_flow_review/bootstrap'; root.dataset.bulkCreateUrl='/__task_flow_review/bulk';
    document.querySelector('#content').append(root);
  });
  await page.addStyleTag({url:'http://127.0.0.1:8787/stylesheets/task_flow.css'});
  await page.addScriptTag({url:'http://127.0.0.1:8787/javascripts/task_flow.js'});
  const editor=page.locator('[data-testid="task-flow-editor-container"]');
  const check=(ok,msg)=>{if(!ok) throw new Error(msg);};
  await editor.waitFor();
  const initialBootstrapCalls=calls;
  const results=[];
  for(const size of [{width:780,height:493},{width:1280,height:800}]){
    await page.setViewportSize(size);
    await page.getByRole('button',{name:'全画面表示',exact:true}).click();
    await page.waitForFunction(()=>document.querySelector('[data-fullscreen="true"]'));
    const info=await page.evaluate(()=>{
      const ed=document.querySelector('[data-fullscreen="true"]'), header=document.querySelector('#header');
      const button=[...ed.querySelectorAll('button')].find(b=>b.textContent.includes('タスク追加'));
      const r=button.getBoundingClientRect(), rect=ed.getBoundingClientRect();
      return {rect:{x:rect.x,y:rect.y,width:rect.width,height:rect.height},
        z:getComputedStyle(ed).zIndex,headerZ:getComputedStyle(header).zIndex,
        hit:button.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))};
    });
    check(info.rect.x===0&&info.rect.y===0&&info.rect.width===size.width&&info.rect.height===size.height,'fullscreen bounds');
    check(info.hit,'header blocks toolbar');
    const count=await page.locator('.react-flow__node').count();
    await page.getByRole('button',{name:'タスク追加',exact:true}).click();
    check(await page.locator('.react-flow__node').count()===count+1,'toolbar click');
    await page.screenshot({path:'/tmp/task-flow-fullscreen-'+size.width+'.png'});
    await page.getByRole('button',{name:'JSON出力',exact:true}).click();
    const modal=page.locator('.task-flow-modal');
    await modal.waitFor();
    check(await modal.evaluate(el=>el.contains(document.elementFromPoint(10,10))),'modal behind header/editor');
    await page.keyboard.press('Escape');
    check(await editor.getAttribute('data-fullscreen')==='true','modal Escape exits fullscreen');
    await page.getByRole('button',{name:'閉じる',exact:true}).click();
    await page.getByRole('button',{name:'全画面解除',exact:true}).click();
    check(await editor.getAttribute('data-fullscreen')==='false','toggle off');
    check(await page.locator('.react-flow__node').count()===count+1,'state lost');
    results.push({size,...info,jsonModal:'PASS',statePreserved:'PASS'});
  }
  await page.getByRole('button',{name:'全画面表示',exact:true}).click();
  for(const expected of ['一括登録エラー','Redmine への一括登録が完了しました']){
    await page.getByRole('button',{name:/Redmineに一括登録/}).click();
    await page.getByText(expected,{exact:true}).waitFor();
    check(await page.locator('.task-flow-modal').evaluate(el=>el.contains(document.elementFromPoint(10,10))),'result modal behind header/editor');
    const toast=page.locator('.task-flow-toast');
    await toast.waitFor();
    check(await toast.evaluate(el=>{const r=el.getBoundingClientRect();return el.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));}),'toast behind modal');
    await toast.locator('>div').last().click();
    await page.getByRole('button',{name:'閉じる',exact:true}).click();
  }
  await page.getByRole('button',{name:'全画面解除',exact:true}).click();
  check(calls===initialBootstrapCalls,'unexpected bootstrap re-fetch');
  await page.evaluate(()=>localStorage.removeItem('task_flow_draft_v1_987654_987654'));
  return {mode:'real Redmine login DOM + compiled app + mocked API',results,bulkCalls,bootstrapCalls:calls,overlays:'PASS'};
}

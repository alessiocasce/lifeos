import {test,expect} from '@playwright/test';
test.beforeEach(async({page})=>{await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());});
test('signup requires available username, retains it for confirmation, never signs in an unverified account',async({page})=>{
  await page.addInitScript(()=>localStorage.setItem('qa-user','null'));
  await page.goto('/');await page.getByRole('button',{name:'Create account',exact:true}).click();
  await page.getByLabel('Email',{exact:true}).fill('new@example.test');await page.getByLabel('Password',{exact:true}).fill('fixture-password');
  await page.getByLabel('Username',{exact:true}).fill('taken');await page.getByLabel('Email',{exact:true}).focus();
  await expect(page.getByRole('status')).toContainText('already taken');
  await page.getByRole('button',{name:'Create Account',exact:true}).click();await expect(page.getByRole('alert')).toContainText('already taken');
  await page.getByLabel('Username',{exact:true}).fill('chosen_user');await page.getByRole('button',{name:'Create Account',exact:true}).click();
  await expect(page.getByRole('status')).toContainText('Check your email');
  expect(await page.evaluate(()=>localStorage.getItem('qa-pending-username'))).toBe('chosen_user');
  expect(await page.evaluate(()=>localStorage.getItem('qa-user'))).toBe('null');
});
test('existing incomplete user must choose a username before Community; reload persists identity',async({page})=>{
  await page.addInitScript(()=>{if(sessionStorage.getItem('onboard'))return;sessionStorage.setItem('onboard','1');localStorage.setItem('qa-profile-incomplete','1');});
  await page.goto('/community');await expect(page.getByRole('heading',{name:'Choose your username'})).toBeVisible();
  await page.getByRole('textbox',{name:'Username'}).fill('member_one');await page.getByRole('button',{name:'Save username'}).click();
  await expect(page.getByRole('heading',{name:'Choose your username'})).toHaveCount(0);
  await page.reload();await expect(page.getByRole('heading',{name:'Choose your username'})).toHaveCount(0);
});

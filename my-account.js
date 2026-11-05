(() => {
  const client = window.supabaseClient;
  const $ = id => document.getElementById(id);
  const fmt = value => Number(value || 0).toLocaleString('en-NG');
  function toast(message){const el=$('toast');el.textContent=message;el.classList.add('show');setTimeout(()=>el.classList.remove('show'),2600)}
  async function loadAccount(){
    if(!client){toast('Supabase is not ready.');return}
    $('historyList').innerHTML='<p class="muted">Loading your transactions…</p>';
    const {data:{user},error:authError}=await client.auth.getUser();
    if(authError||!user){$('coinsBalance').textContent='0';$('beansBalance').textContent='0';$('historyList').innerHTML='<p class="muted">Please sign in to view your wallet.</p>';return}
    const {data:wallet,error:walletError}=await client.from('fc_wallets').select('coins,beans').eq('user_id',user.id).maybeSingle();
    if(walletError){console.error(walletError);$('historyList').innerHTML='<p class="muted">Could not load wallet. Check that the Coins & Beans SQL migration has been run.</p>';return}
    $('coinsBalance').textContent=fmt(wallet?.coins);
    $('beansBalance').textContent=fmt(wallet?.beans);
    const {data:rows,error}=await client.from('fc_wallet_ledger').select('id,currency,amount,reason,created_at').eq('user_id',user.id).order('created_at',{ascending:false}).limit(30);
    if(error){console.error(error);$('historyList').innerHTML='<p class="muted">Wallet loaded, but transaction history could not be loaded.</p>';return}
    if(!rows?.length){$('historyList').innerHTML='<p class="muted">No transactions yet. Your earned rewards will appear here.</p>';return}
    $('historyList').innerHTML=rows.map(row=>{
      const positive=Number(row.amount)>0;const icon=row.currency==='coins'?'🪙':'🫘';
      const date=new Date(row.created_at).toLocaleString('en-NG',{dateStyle:'medium',timeStyle:'short'});
      return `<div class="history-row"><span class="history-icon">${icon}</span><div class="history-main"><b>${escapeHtml(row.reason||'Wallet activity')}</b><small>${date} · ${row.currency}</small></div><span class="amount ${positive?'positive':''}">${positive?'+':''}${fmt(row.amount)}</span></div>`;
    }).join('');
  }
  function escapeHtml(value){return String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
  $('refreshBtn').addEventListener('click',loadAccount);$('refreshHistory').addEventListener('click',loadAccount);
  document.addEventListener('DOMContentLoaded',loadAccount);loadAccount();
})();

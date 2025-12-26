// Simple frontend-only chat app logic using localStorage
(function(){
  const USERS_KEY = 'hatai_users'
  const MSGS_KEY = 'hatai_msgs'
  const CURR_KEY = 'hatai_current'

  function readJSON(key, fallback){
    try{const v=localStorage.getItem(key);return v?JSON.parse(v):fallback}
    catch(e){return fallback}
  }
  function writeJSON(key,val){localStorage.setItem(key,JSON.stringify(val))}

  function getUsers(){return readJSON(USERS_KEY,[])}
  function saveUsers(u){writeJSON(USERS_KEY,u)}
  function addUser(user){const u=getUsers();u.push(user);saveUsers(u)}

  function setCurrent(username){localStorage.setItem(CURR_KEY,username)}
  function getCurrent(){return localStorage.getItem(CURR_KEY)}

  function msgsObj(){return readJSON(MSGS_KEY,{})}
  function saveMsgs(obj){writeJSON(MSGS_KEY,obj)}
  function pairKey(a,b){return [a,b].sort().join('__')}
  function getConversation(a,b){const obj=msgsObj();return obj[pairKey(a,b)]||[]}
  function saveMessage(a,b,msg){const obj=msgsObj();const key=pairKey(a,b);obj[key]=obj[key]||[];obj[key].push(msg);saveMsgs(obj)}

  // Signup page
  const signupForm = document.getElementById('signupForm')
  if(signupForm){
    signupForm.addEventListener('submit',e=>{
      e.preventDefault();
      const username = signupForm.username.value.trim();
      const password = signupForm.password.value;
      if(!username || !password) return;
      const users = getUsers();
      if(users.find(u=>u.username.toLowerCase()===username.toLowerCase())){
        alert('Username already exists. Choose another.');return;
      }
      addUser({username,password});
      alert('Account created — please sign in.');
      window.location.href = 'signin.html';
    })
  }

  // Signin page
  const signinForm = document.getElementById('signinForm')
  if(signinForm){
    const errEl = document.getElementById('signinError')
    signinForm.addEventListener('submit',e=>{
      e.preventDefault();
      const username = signinForm.username.value.trim();
      const password = signinForm.password.value;
      const users = getUsers();
      const found = users.find(u=>u.username===username && u.password===password)
      if(found){setCurrent(username);window.location.href='chat.html'}
      else{ if(errEl){errEl.style.display='block'; errEl.textContent='Invalid username or password.'} }
    })
  }

  // Chat page logic
  const usersListEl = document.getElementById('usersList')
  const searchInput = document.getElementById('searchUser')
  const messagesEl = document.getElementById('messages')
  const selectedNameEl = document.getElementById('selectedName')
  const meNameEl = document.getElementById('meName')
  const msgInput = document.getElementById('msgInput')
  const sendBtn = document.getElementById('sendBtn')

  if(document.body && document.body.matches('body')){
    // set year handled in HTML
  }

  if(usersListEl && messagesEl){
    let current = getCurrent();
    if(!current){window.location.href='signin.html';return}
    meNameEl.textContent=current

    let users = getUsers().filter(u=>u.username!==current)
    let selected = users.length?users[0].username:null

    function renderUsers(filter=''){
      users = getUsers().filter(u=>u.username!==current)
      usersListEl.innerHTML=''
      const q = filter.trim().toLowerCase()
      users.filter(u=>u.username.toLowerCase().includes(q)).forEach(u=>{
        const li = document.createElement('li')
        li.dataset.name = u.username
        const av = document.createElement('div'); av.className='avatar'; av.textContent = u.username.charAt(0).toUpperCase()
        const nm = document.createElement('div'); nm.textContent = u.username
        li.appendChild(av); li.appendChild(nm)
        if(u.username===selected) li.classList.add('selected')
        li.addEventListener('click',()=>{ selected = u.username; renderUsers(searchInput?.value||''); renderConversation(); })
        usersListEl.appendChild(li)
      })
    }

    function renderConversation(){
      selectedNameEl.textContent = selected || 'Select a user'
      messagesEl.innerHTML=''
      if(!selected) return
      const conv = getConversation(current, selected)
      conv.forEach(m=>{
        const d = document.createElement('div'); d.className='msg '+(m.from===current?'me':'them'); d.textContent = m.text
        messagesEl.appendChild(d)
      })
      messagesEl.scrollTop = messagesEl.scrollHeight
    }

    sendBtn.addEventListener('click',()=>{
      const text = msgInput.value.trim(); if(!text || !selected) return; const m = {from:current,to:selected,text,ts:Date.now()}; saveMessage(current,selected,m); msgInput.value=''; renderConversation(); })

    msgInput.addEventListener('keypress',e=>{ if(e.key==='Enter'){ e.preventDefault(); sendBtn.click() } })

    searchInput && searchInput.addEventListener('input',e=>{ renderUsers(e.target.value) })

    renderUsers(); renderConversation();
  }

})();

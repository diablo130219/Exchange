(function(){
  try{
    var t=localStorage.getItem('easybet-theme');
    t=(t==='light'||t==='dark')?t:'dark';
    document.documentElement.setAttribute('data-theme',t);
  }catch(e){
    document.documentElement.setAttribute('data-theme','dark');
  }
})();

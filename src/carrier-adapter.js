/* Minimal bridge to the original classic-script app. No layout or auth replacement. */
(() => {
  if (window.PosteFinderCarriers) return;
  const originalRefresh=refreshView, originalRender=renderList;
  const originalFilter=checkFilter, originalStatus=getOpeningStatus, originalSend=sendMessage;
  let hooks={};
  refreshView=function(){hooks.beforeRefresh?.();return originalRefresh();};
  renderList=function(data){originalRender(data);hooks.decorate?.(data);};
  checkFilter=function(loc){return (hooks.baseFilter?.(loc)??originalFilter(loc))&&(hooks.filter?.(loc)??true);};
  getOpeningStatus=function(schedule){return hooks.status?.(schedule)??originalStatus(schedule);};
  sendMessage=async function(){
    const input=document.getElementById('chat-input'), message=input?.value.trim();
    if(message&&hooks.chat?.(message))return;
    return originalSend();
  };
  window.PosteFinderCarriers={
    install(next){hooks=next;},
    locations(){return LOCATIONS_DATA;},
    replaceLocations(items){LOCATIONS_DATA.splice(0,LOCATIONS_DATA.length,...items);},
    state(){return {gps:userPosition,reference:referencePoint,places:customPlaces,removedIds:[...removedIds],filter:currentFilter};},
    locate(){return locateUser();},
    refresh(){refreshView();},
    focus(id){return selectLocation(id);},
    message(text,sender='ai'){addMessage(text,sender);},
    consumeMessage(){document.getElementById('chat-input').value='';},
    showOrganizer(){if(typeof setMobileView==='function'&&window.matchMedia('(max-width: 767px), (max-width: 1023px) and (max-height: 500px)').matches)setMobileView('list');document.getElementById('parcel-organizer')?.scrollIntoView({block:'nearest'});},
    showChat(){const c=document.getElementById('chat-window');c.classList.remove('closed');c.classList.add('open');}
  };
})();

(() => {
 const card=$('beta-release-notes'),root=$('beta-release-content');if(!card||!root)return;card.hidden=false;
 if(dashboardWorkspace!=='beta')$('open-beta-roles').hidden=true;
 const title=card.querySelector('h2');if(title)title.textContent='Release notes';
 void (async()=>{try{const response=await fetch(dashboardApiUrl('releases'),{cache:'no-store'});if(!response.ok)throw Error('Release notes could not be loaded.');const {releases}=await response.json();root.replaceChildren();for(const release of releases){const h=document.createElement('h3'),p=document.createElement('p'),details=document.createElement('details'),toggle=document.createElement('summary'),list=document.createElement('ul');h.textContent=release.title;p.textContent=release.summary;toggle.textContent='Read the release notes';for(const text of [...release.changes,...release.tryIt,release.scope]){const li=document.createElement('li');li.textContent=text;list.append(li);}details.append(toggle,list);root.append(h,p,details);}}catch(error){root.textContent=error.message;}})();
})();

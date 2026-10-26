// Resume the original authorization after account creation lands on the provider's home page.
// Never infer success from a homepage or collect credentials from its DOM.
function oauthFlow(authorize,redirect){
 const origin=new URL(authorize).origin,target=new URL(redirect);let sawAccount=false,resumes=0;
 return {redirect(url){try{const u=new URL(url);return u.origin===target.origin&&u.pathname===target.pathname;}catch{return false;}},
  visit(url){let u;try{u=new URL(url);}catch{return false;}if(u.origin!==origin||this.redirect(url))return false;
   if(/^\/(login|signup|register|signin|verify|verify-email)(\/|$)/i.test(u.pathname)){sawAccount=true;return false;}
   const home=/^\/(home\/?|dashboard\/?|user\/[^/]+\/?)?$/.test(u.pathname);
   if(sawAccount&&home&&resumes<2){sawAccount=false;resumes++;return true;}return false;
  },sameProvider(url){try{const u=new URL(url);return u.protocol==='https:'&&u.origin===origin;}catch{return false;}}
 };
}
module.exports={oauthFlow};

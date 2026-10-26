// A 256-bit recovery secret owns an optional AniDeck account. Only its domain-separated hash is the user id.
// No provider token, password, recovery key or reversible credential is stored by the Worker.
export async function localIdentity(token){
 if(typeof token!=='string'||!/^adk_[a-f0-9]{64}$/.test(token))return null;
 const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode('anideck-account-v1:'+token));
 return {id:'anideck:'+Array.from(new Uint8Array(digest),x=>x.toString(16).padStart(2,'0')).join(''),name:'',avatar:''};
}

!async function(){for(;!Spicetify.React||!Spicetify.ReactDOM;)await new Promise(i=>setTimeout(i,10));var i;i=async function(){for(;null==Spicetify||!Spicetify.showNotification;)await new Promise(i=>setTimeout(i,100));Spicetify.showNotification(Spicetify.Platform.Session.accessToken),Spicetify.showNotification("Hello there!"),console.log("helo there"),console.log("abc",Spicetify.URI.fromString("https://open.spotify.com/track/5FMXrphygZ4z3gVDHGWxgl?si=41d15401de44471c")),console.log("a",Spicetify.Panel.currentPanel)},(async()=>{await i()})()}();
#!/usr/local/bin/node
'use strict'; 
/*
	YouTube Player


	This is a "player"-module that will play the audio stream from a youtube link. URIs should be 
	any valid youtube link eg. https://www.youtube..., https://m.youtube.... etc


	This explains how to get audio from an online video
		https://stackoverflow.com/questions/15241076/download-only-audio-from-a-youtube-video

	This explains how we need to reconfigure ffmpeg to support https 
		https://stackoverflow.com/questions/31514949/ffmpeg-over-https-fails
		https://trac.ffmpeg.org/wiki/CompilationGuide/Ubuntu


	Since YouTube makes it a bit tricky to get the actual url of the video/audio resource, we use another
	node module to get the actual playable url (and info about the track): 
		https://github.com/fent/node-ytdl-core

	These explains how ^^ most likely works, visa-vi youtube's "security":
		https://superuser.com/questions/773719/how-do-all-of-these-save-video-from-youtube-services-work/773998#773998
		https://tyrrrz.me/Blog/Reverse-engineering-YouTube

	And these are url's do download the scrambling files.... not sure if they're both valid or if it depends
	on location/date
		http://s.ytimg.com/yts/jsbin/html5player-en_US-vflycBCEX.js
		http://s.ytimg.com/yts/jsbin/player_remote_ux-vflLBJV8l/en_US/base.js	






NOTE ABOUT FORMATS AND STREAMING:
	In order to stream, the output file cannot have headers since these are written after the rest of the file...
	so if you don't want to wait:
		bin/ffmpeg -i 'https://r3---sn-ugx-5goe.googlevideo.com/videoplayback?expire=1533136049&c=WEB&ei=UXhhW6L7IIS78wS-xaXQAw&key=cms1&source=youtube&mime=video%2Fmp4&fvip=2&signature=06268B76C04686FFA0E913573C5B173409F2C7DA.38790CA157DB3ACD05A2347172AA2AC1CCC6ED57&requiressl=yes&sparams=dur,ei,expire,id,ip,ipbits,ipbypass,itag,lmt,mime,mip,mm,mn,ms,mv,pl,ratebypass,requiressl,source&ipbits=0&ratebypass=yes&itag=22&ip=54.87.70.219&pl=13&lmt=1532679950105801&dur=695.669&id=o-ADJoUAdbMamP-iMiS6DectHp7SoEWx3GxZ7TyD4gCH-0&redirect_counter=1&rm=sn-p5qrr7l&req_id=25f185eb290ba3ee&cms_redirect=yes&ipbypass=yes&mip=2.65.63.213&mm=31&mn=sn-ugx-5goe&ms=au&mt=1533114381&mv=m' -vn -f s16le -acodec pcm_s16le - |  play -r 44100 -b 16 -c 2 -e signed-integer -t raw -

	But if have time to download the file first
		bin/ffmpeg -i 'https://r3---sn-ugx-5goe.googlevideo.com/videoplayback?expire=1533136049&c=WEB&ei=UXhhW6L7IIS78wS-xaXQAw&key=cms1&source=youtube&mime=video%2Fmp4&fvip=2&signature=06268B76C04686FFA0E913573C5B173409F2C7DA.38790CA157DB3ACD05A2347172AA2AC1CCC6ED57&requiressl=yes&sparams=dur,ei,expire,id,ip,ipbits,ipbypass,itag,lmt,mime,mip,mm,mn,ms,mv,pl,ratebypass,requiressl,source&ipbits=0&ratebypass=yes&itag=22&ip=54.87.70.219&pl=13&lmt=1532679950105801&dur=695.669&id=o-ADJoUAdbMamP-iMiS6DectHp7SoEWx3GxZ7TyD4gCH-0&redirect_counter=1&rm=sn-p5qrr7l&req_id=25f185eb290ba3ee&cms_redirect=yes&ipbypass=yes&mip=2.65.63.213&mm=31&mn=sn-ugx-5goe&ms=au&mt=1533114381&mv=m' -vn -acodec pcm_s16le temp.wav | play temp.wav

	The nodejs ytdl library does support starting play from a specific timestamp, but since we can't get ytdl streams
	to work at all that's not an option, but you could look at their code...



	NOTE: This module exports a constructor that should be new:ed

*/
module.exports = function YouTubeLoader(scope,settings){
	
  	const BetterLog=scope.BetterLog
    const cX=scope.BetterUtil.cX
    const head=scope.BetterUtil.httpX.head
    const ffmpeg=scope.api.apps['q-ffmpeg'].ffmpeg
    const ytdl=scope.api.apps['ytdl-core']
	
	//TODO: 2018-11-25: Implement these two
    // const ytpl=scope.api.apps.ytpl
    // const ytsr=scope.api.apps.ytsr









	function YouTubePlayer(){

		Object.defineProperty(this,'log',{value:new BetterLog(this)});	


		//Make sure we can always access 'this' in methods, without having to 'bind' them
		const self = this;


		/*
		* @method canPlayUri 
		*
		* @param string uri 	The uri/url/id to check
		*
		* @return bool
		*/
		this.canPlayUri=function(uri){
			try{
		//TODO: could be playlist as well
				getId(uri); 
				return true;
			}catch(err){
				if(err=='Not valid YouTube uri')
					return false;
				else
					throw err;
			}
		}



		/*
		* @param string x 				Video id, url, uri etc
		* @throws Error, TypeError
		* @return string 				Video id
		*/
		function getId(x){
			x=cX.trim(x,true); //true==if not non-empty string, throw error
			
			var m;
			if(m=x.match(/^youtube:track:(.*)$/))
				if(ytdl.validateID(m[1]))
					return m[1];
				else
					throw 'Bad format of YouTube video id: '+String(m[1]);

			var idOrErr = ytdl.getVideoID(x); 
			if(idOrErr instanceof Error)
				throw 'Not valid YouTube uri';
			else if (typeof idOrErr != 'string')
				throw new TypeError("BUGBUG: Expected ytdl.getVideoID() to return string or Error, got: "+cX.logVar(idOrErr));
			else
				return idOrErr;
		}



		/*
		* @method getUriDetails 	Get information about the track
		*
		* @param string id 		The YouTube video id (@see return of this.canPlayUri)
		*
		* @return Promise(<TrackObj>,err)
		*/
		this.getUriDetails=function(uri){
			try{var id=getId(uri)}catch(err){return log.reject("Could not get uri details: "+err)};
			var r=cX.getRandomInt();
			log.highlight('blue',r);
			log.traceFunc(arguments, 'getUriDetails_'+r);

		/* NOTE: why this takes time
			- ytdl.getInfo is actually getFullInfo() from here https://github.com/fent/node-ytdl-core/blob/master/lib/info.js
			- It calls 2 funcs that take time
				- sig.js getTokens() 1 second a few times, then uses cached tokens = instant
				- info.js getBasicInfo() - b/w 0.5 and 3 seconds each time, seems to depend on youtube's servers
				- info.js gotConfig() - same as ^, runs after ^ instead of paralell because uses param 'sts' from ^ response... not 
					sure what it does because you can run the query without it, but not sure what you get...
			    -- Explains query params: https://tyrrrz.me/Blog/Reverse-engineering-YouTube

		*/
			return ytdl.getInfo(id)
				.then(allInfo=>{
					// console.log(logWho,allInfo);
					//From the available formats, get one to use, prefering audio-only resources 
					//or the video with the best audio
					// for (let x of informationo.formats){
					// 	if(x.audioEncoding)
					// 		console.log(x.itag, x.type,x.container,x.audioEncoding,x.audioBitrate,x.audio_sample_rate);
					// }
					var format=ytdl.chooseFormat(allInfo.formats, {filter:'audioonly'}) || ytdl.chooseFormat(allInfo.formats, {quality:'highestaudio'});
				
					/*
						YouTube has 3 audio formats: 
							acc - https://en.wikipedia.org/wiki/Advanced_Audio_Coding
								Containers: mp4(a+v),3gp(a+v),m4a(audio only) Specific codec: ACC-LC
							opus - http://opus-codec.org/
								Container always: webm, Supports sample rates: 8-48 kHz 
							vorbis - 
								Container always: webm
							

					*/
					//Build the obj we'll be returning every time this video id is requested
					var uriDetails = {
						uri:'youtube:track:'+id
						,contents:format.url //will replace what is most likely the player id

						,title:allInfo.title
						,thumbnail:allInfo.thumbnail_url
						,validUntil:Date.parse(cX.tomorrow())


						,format:format.container
						,codec:format.audioEncoding	 //should always be vorbis, acc or opus (null if stream contains no audio, but that shouldnt happen)
						,bit_depth:null //since codec is lossy
						,channels:format.audio_channels
						,bit_rate:format.audioBitrate 
						,duration:format.live?0:allInfo.length_seconds	//live ==> duration=0 ==> radio
						,sample_rate:format.audio_sample_rate || format.sample_rate || null  
									
					};
					log.highlight('red',"Now we got YouTube info for:",r);
					// console.log(uriDetails);
					return uriDetails;
				})
			;
		}



	//2019-07-04 TODO: make this a global method that grabs an online stream
		/*
		* @method getStremObj 		Fetch the audio track from a YouTube video
		*
		* @param <TrackObj> tObj 	
		*
		* @return Promise(<Readable>)
		*/
		this.getStream=function(tObj){
			log.traceFunc(arguments);

			//Make sure that the url is still valid...
			return head(tObj.contents)
				.catch(err=>{
					if(err.code==403){
						return log.makeError('YouTube returned 403 Forbidden, the content URL may be old. Try fetching it again...',err)
							.setCode('EEXPIRED').exec().reject();
					}else{
						return err.reject();
					}
				})
				//...then fetch the stream
				.then(()=>ffmpeg(tObj.contents,tObj.format,this.log))

		}





		/*
		* Search for a track
		*
		* @return Promise 	Resolves with an array of uri's
		*/
		this.search=function(str){
	//TODO: implement with ytsr ^^
		}


		/*
		* @func scanLibrary				
		*
		* @param func *includeFilter 		Optional. Filter function that returns true if the file should be included.
		* 
		* @return <Promise>(object,n/a) 	Object keys are URIs, values are <TrackObj>
		* @access public
		*/
		this.scanLibrary=function(includeFilter){

		}


	} //end of YouTubePlayer

	return new YouTubePlayer();
};


jQuery(function($){
	window.playCanvas();	



	var c=document.getElementById("text-mask");
	var ctx=c.getContext("2d");
	ctx.globalCompositeOperation = 'lighter ';

	var r = 1;
	var width = c.width = r * window.innerWidth;
	var height = c.height = r * window.innerHeight;

	ctx.rect(0, 0, width, height);
	ctx.fillStyle = 'rgba(255,255,255, 0.96)';
	ctx.fill();
	ctx.globalCompositeOperation = 'destination-out';

	var kitty = new Image();
	kitty.src = 'http://i954.photobucket.com/albums/ae30/rte148/891blog_keyboard_cat.gif';
	kitty.onload = function(){

		ctx.fillStyle = 'rgba(255,255,255,1)';
		ctx.font = 'bold 16vw "proxima-nova"';
		// ctx.textBaseline = 'top';
		ctx.textAlign = 'center';
		ctx.fillText("RAKEDEN",width / 2, height / 1.7);

	};
})

var i64 = require("node-int64");
var zlib = require("zlib");


function noop(){}

function parseNBT(buffer,index){

    index = index||0;

    
    function read(type){
    	return readers[type]();
	}
	var readers = {
		1:function(){
			return buffer.readInt8(index++);					
		},
		2:function(){
			var val = buffer.readInt16BE(index);
			index += 2;
			return val;
		},
		3:function(){
			var val = buffer.readInt32BE(index);
			index += 4;
			return val;
		},
		4:function(){
            var i64num = new i64(buffer,index);
            var val = new Number(i64num.toNumber());
            val.i64 = i64num;
			index += 8;
			return val;
		},
		5:function(){
			var val = buffer.readFloatBE(index);
			index += 4;
			return val;
		},
		6:function(){
			var val = buffer.readDoubleBE(index);
			index += 8;
			return val;
		},
		7:function(){
			var l = read(3);
			var val = buffer.slice(index,index+l);
			index += l;
			return val;			
		},
		8:function(){
			var l = read(2);
			var val = buffer.slice(index,index+l).toString("utf8");
			index += l;
			return val;			
		},
		9:function(){
			var type = read(1);	
			var values = new Array(read(3));
			for(var i = 0; i < values.length; i++){
				values[i] = read(type);
			}
			return values;
		},
		10:function(){
			var obj = {};
			while(true){
				try{
					var type = read(1);
				}catch(e){
					var type = 0;
				}
				if(type){
					obj[read(8)] = read(type);
				}else{
					return obj;
				}
			}
		},
		11:function(){
			var values = new Array(read(3));
			for(var i = 0; i < values.length; i++){
				values[i] = read(3);
			}
			return values;
		}
	}	

	return readers[10]()[""];
}

function unpackNBT(data,cb){
    cb = cb||noop;
    zlib.inflate(data,function(err,data){
        if(err){
            zlib.gunzip(data,function(err,data){
                if(err){
                    cb(err);
                }else{
                    cb(null,parseNBT(data));
                }
            });
            
        }else{
            cb(null,parseNBT(data));
        }
    });
}

function buildNBT(data){
    
    var bufs = [];
    
    function write(type,data){
        return writers[type](data);
    }
    
    var writers = {
        1:function(data){
            var b = new Buffer(1);
            b.writeInt8(data,0);
            bufs.push(b);
        },
        2:function(data){
            var b = new Buffer(2);
            b.writeInt16BE(data,0);
            bufs.push(b);
        },
        3:function(data){
            var b = new Buffer(4);
            b.writeInt32BE(data,0);
            bufs.push(b);
        },
        4:function(data){
            if(data.i64){
                bufs.push(data.i64.buffer.slice(data.i64.offset,data.i64.offset+7));
            }else{
                var b = new Buffer(8);
                var i = new i64(b,0);
                i.setValue(data instanceof Number?data.valueOf():data);
                bufs.push(b);
            }
        },
        5:function(data){
            var b = new Buffer(4);
            b.writeFloatBE(data,0);
            bufs.push(b);
        },
        6:function(data){
            var b = new Buffer(8);
            b.writeDoubleBE(data,0);
            bufs.push(b);
        },
        7:function(data){
            write(3,data.length)
            bufs.push(data);
        },
        8:function(data){
            data = new Buffer(data,"utf8");
            write(2,data.length);
            bufs.push(data);
        },
        9:function(data){
            var ht = 0;
            for(var i = 0; i < data.length; i++){
                var t = type(data[i]);
                if(t > ht){
                    ht = t;
                }
            }
            write(1,ht);
            write(3,data.length);
            for(var i = 0; i < data.length; i++){
                write(ht,data[i]);
            }            
        },
        10:function(data){
            for(var a in data){
                var v = data[a];
                var t = type(v); 
                write(1,t);
                write(8,a);
                write(t,v);                
            }
            write(1,0);
        },
        11:function(data){
            write(3,data.length);
            for(var i = 0; i < data.length; i++){
                write(3,data[i]);
            }
        }
    }
    
    function type(val){
        switch(typeof val){
            case "object":
                if(val instanceof Number){
                    return 4;
                }else{
                    return (val instanceof Array)?9:((val instanceof Buffer)?7:10);
                }
            case "number":                
                if(val % 1 == 0){            
                    if(val < -128 || val > 127){
                        if(val < -32768 || val > 32767){
                            if(val < -2147483648 || val > 2147483647){
                                return 4;
                            }else{
                                return 3;
                            }
                        }else{
                            return 2;
                        }
                    }else{
                        return 1;
                    }
                }else{
                    return 6;
                }
            case "string":
                return 8;
        }
    }
    
    
    write(10,{"":data});
    var totallength = 0;
    var bufpos = 0;
    for(var i = 0; i < bufs.length; i++){
        totallength += bufs[i].length;
    }
    var buf = new Buffer(totallength);
    for(var i = 0; i < bufs.length; i++){
        var v = bufs[i];
        v.copy(buf,bufpos);
        bufpos += v.length;
    }
    return buf;
}

function packNBT(data,cb){
    cb = cb||noop;
    zlib.deflate(buildNBT(data),function(err,data){
        if(err){
            cb(err);
        }else{
            cb(null,data);
        }
    });
}

exports.parse = parseNBT;
exports.build = buildNBT;
exports.pack = packNBT;
exports.unpack = unpackNBT;
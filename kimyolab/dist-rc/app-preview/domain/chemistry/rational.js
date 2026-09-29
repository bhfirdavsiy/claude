function absBig(n       ){ return n < 0n ? -n : n; }
export function gcdBig(a       ,b       )        { a=absBig(a); b=absBig(b); while(b){ const t=a%b; a=b; b=t; } return a||1n; }
export function lcmBig(a       ,b       )        { return absBig(a/gcdBig(a,b)*b); }

export class Rational {
  n       ; d       ;
  constructor(n              , d              =1n){
    let nn=BigInt(n), dd=BigInt(d);
    if(dd===0n) throw new Error('RATIONAL_ZERO_DENOMINATOR');
    if(dd<0n){nn=-nn;dd=-dd;}
    const g=gcdBig(nn,dd); this.n=nn/g; this.d=dd/g;
  }
  add(o         ){return new Rational(this.n*o.d+o.n*this.d,this.d*o.d)}
  sub(o         ){return new Rational(this.n*o.d-o.n*this.d,this.d*o.d)}
  mul(o         ){return new Rational(this.n*o.n,this.d*o.d)}
  div(o         ){if(o.n===0n) throw new Error('RATIONAL_DIV_ZERO'); return new Rational(this.n*o.d,this.d*o.n)}
  neg(){return new Rational(-this.n,this.d)}
  isZero(){return this.n===0n}
}

// app.js
const _now = () => Date.now();
console.log('[app] script loaded', _now());

App({
  onLaunch() {
    console.log('[app] onLaunch', _now());
  },
  onShow() {
    console.log('[app] onShow', _now());
  },
  onError(err) {
    console.error('[app] onError', _now(), err);
  },
  onPageNotFound(res) {
    console.error('[app] onPageNotFound', _now(), res);
  },
  globalData: {
    userId: 'demo'
  }
});

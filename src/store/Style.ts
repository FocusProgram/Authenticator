export class Style implements Module {
  getModule() {
    return {
      state: {
        style: {
          timeout: false,
          isSelecting: false,
          slidein: false, // menu
          slideout: false, // menu
          backupSlidein: false, // full-page backup navigation
          backupSlideout: false, // full-page backup navigation
          fadein: false, // info
          fadeout: false, // info
          show: false, // info
          qrfadein: false,
          qrfadeout: false,
          notificationFadein: false,
          notificationFadeout: false,
          hotpDisabled: false,
        },
      },
      mutations: {
        showMenu(state: StyleState) {
          state.style.slidein = true;
          state.style.slideout = false;
        },
        hideMenu(state: StyleState) {
          state.style.slidein = false;
          state.style.slideout = true;
          setTimeout(() => {
            state.style.slideout = false;
          }, 200);
        },
        showBackupPanel(state: StyleState) {
          state.style.backupSlidein = true;
          state.style.backupSlideout = false;
        },
        hideBackupPanel(state: StyleState) {
          state.style.backupSlidein = false;
          state.style.backupSlideout = true;
          setTimeout(() => {
            state.style.backupSlideout = false;
          }, 200);
        },
        showInfo(state: StyleState, noAnimate?: boolean) {
          if (noAnimate) {
            state.style.show = true;
          } else {
            state.style.fadein = true;
            state.style.fadeout = false;
          }
        },
        hideInfo(state: StyleState, noAnimate?: boolean) {
          if (noAnimate) {
            state.style.show = false;
          } else {
            state.style.fadein = false;
            state.style.fadeout = true;
          }
          setTimeout(() => {
            state.style.fadeout = false;
          }, 200);
        },
        showQr(state: StyleState) {
          state.style.qrfadein = true;
          state.style.qrfadeout = false;
        },
        hideQr(state: StyleState) {
          state.style.qrfadein = false;
          state.style.qrfadeout = true;
          setTimeout(() => {
            state.style.qrfadeout = false;
          }, 200);
        },
        showNotification(state: StyleState) {
          state.style.notificationFadein = true;
          state.style.notificationFadeout = false;
          setTimeout(() => {
            state.style.notificationFadein = false;
            state.style.notificationFadeout = true;
            setTimeout(() => {
              state.style.notificationFadeout = false;
            }, 200);
          }, 1000);
        },
        toggleSelect(state: StyleState) {
          state.style.isSelecting = !state.style.isSelecting;
        },
        setHotpDisabled(state: StyleState, disabled: boolean) {
          state.style.hotpDisabled = disabled;
        },
      },
      getters: {
        // Returns true if menu or info screen shown
        isMenuShown(state: StyleState) {
          return (
            state.style.fadein ||
            state.style.show ||
            state.style.slidein ||
            state.style.backupSlidein
          );
        },
      },
      namespaced: true,
    };
  }
}

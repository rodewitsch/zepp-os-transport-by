import { BaseApp } from '@zeppos/zml/base-app'

App(
  BaseApp({
    globalData: {
      favorites: [],
      lastUpdate: null,
    },

    onCreate(options) {
      console.log('Transport BY app created')
    },

    onDestroy(options) {
      console.log('Transport BY app destroyed')
    },
  })
)

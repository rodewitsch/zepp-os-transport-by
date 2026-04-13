import { BaseApp } from '@zeppos/zml/base-app'

App(
  BaseApp({
    globalData: {
      favorites: [],
      lastUpdate: null,
      messaging: {},
    },
  })
)

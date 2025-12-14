import { configureStore } from '@reduxjs/toolkit'
import hotstuffReducer from './hotstuffSlice'
import tendermintReducer from './tendermintSlice'
import cryptoHotstuffReducer from './cryptoHotstuffSlice'

export const store = configureStore({
  reducer: {
    hotstuff: hotstuffReducer,
    tendermint: tendermintReducer,
    cryptoHotstuff: cryptoHotstuffReducer,
  },
})

export type RootState = ReturnType<typeof store.getState>
export type AppDispatch = typeof store.dispatch

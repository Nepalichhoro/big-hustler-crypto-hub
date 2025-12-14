import { configureStore } from '@reduxjs/toolkit'
import hotstuffReducer from './hotstuffSlice'
import tendermintReducer from './tendermintSlice'

export const store = configureStore({
  reducer: {
    hotstuff: hotstuffReducer,
    tendermint: tendermintReducer,
  },
})

export type RootState = ReturnType<typeof store.getState>
export type AppDispatch = typeof store.dispatch

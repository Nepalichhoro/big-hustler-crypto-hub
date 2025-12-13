import { configureStore } from '@reduxjs/toolkit'
import hotstuffReducer from './hotstuffSlice'

export const store = configureStore({
  reducer: {
    hotstuff: hotstuffReducer,
  },
})

export type RootState = ReturnType<typeof store.getState>
export type AppDispatch = typeof store.dispatch

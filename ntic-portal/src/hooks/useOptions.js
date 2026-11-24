import { useEffect, useState } from 'react';
import { getOptions } from '../api/reference.js';

// { options, error } - options is null until the lists have loaded
export function useOptions() {
  const [state, setState] = useState({ options: null, error: '' });
  useEffect(() => {
    let live = true;
    getOptions().then((options) => live && setState({ options, error: '' })).catch((e) => live && setState({ options: null, error: e.message }));
    return () => { live = false; };
  }, []);
  return state;
}

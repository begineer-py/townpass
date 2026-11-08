import {LoaderCircle} from 'lucide-react';
import {routeLoadingMessage} from './route-loading.mjs';
import './RouteLoading.css';

export default function RouteLoading({preparing, comparing, nearby}) {
  const {title,detail}=routeLoadingMessage({preparing,comparing,nearby});
  return <div className="route-results__loading route-loading" role="status" aria-live="polite">
    <div className="route-loading__heading"><LoaderCircle className="spin route-loading__icon" size={22} aria-hidden="true"/><strong>{title}</strong></div>
    <p>{detail}</p>
    <div className="route-loading__track" aria-hidden="true"><span/></div>
  </div>;
}

import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '../utils';

export default function ChreosiPortal() {
  const navigate = useNavigate();
  useEffect(() => {
    navigate(createPageUrl('PortalLogin'), { replace: true });
  }, [navigate]);
  return null;
}
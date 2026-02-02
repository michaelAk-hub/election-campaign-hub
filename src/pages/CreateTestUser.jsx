import React, { useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '../utils';

export default function CreateTestUser() {
  const navigate = useNavigate();

  useEffect(() => {
    const createUser = async () => {
      try {
        await base44.users.inviteUser('mkoutoumbas@windowslive.com', 'admin');
        alert('User created! Check email for invitation link.');
        navigate(createPageUrl('UserManagement'));
      } catch (error) {
        alert('Error: ' + error.message);
      }
    };
    createUser();
  }, [navigate]);

  return <div className="p-8">Creating user...</div>;
}
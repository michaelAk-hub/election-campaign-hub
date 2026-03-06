import React, { useEffect } from 'react';
import { createPageUrl } from '../utils';

export default function DataGrid() {
    useEffect(() => {
        window.location.replace(createPageUrl('Records'));
    }, []);

    return null;
}
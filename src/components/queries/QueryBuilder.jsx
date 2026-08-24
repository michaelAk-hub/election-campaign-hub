import React, { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Plus, Trash2, Play } from 'lucide-react';
import { cn } from "@/lib/utils";

const FIELDS = [
  { key: 'person_id', label: 'ΑΤ (ID)', type: 'text' },
  { key: 'last_name', label: 'Επίθετο', type: 'text' },
  { key: 'first_name', label: 'Όνομα', type: 'text' },
  { key: 'department', label: 'Τμήμα', type: 'text' },
  { key: 'admission_year', label: 'Εισδοχή', type: 'text' },
  { key: 'mobile_phone', label: 'Κινητό', type: 'text' },
  { key: 'contact_person_1', label: 'Άτομο 1', type: 'text' },
  { key: 'contact_person_2', label: 'Άτομο 2', type: 'text' },
  { key: 'member', label: 'Μέλος', type: 'text' },
  { key: 'voted', label: 'Ψήφισε', type: 'boolean' },
  { key: 'notes', label: 'Σημειώσεις', type: 'text' },
];

const OPERATORS = {
  text: [
    { value: '=', label: 'ίσο με (=)' },
    { value: '!=', label: 'διάφορο από (≠)' },
    { value: 'contains', label: 'περιέχει' },
  ],
  boolean: [
    { value: '=', label: 'ίσο με (=)' },
  ]
};

export default function QueryBuilder({ conditions, onChange, onTest, testCount, isTestLoading }) {
  const addCondition = () => {
    onChange([...conditions, { field: 'department', operator: '=', value: '', connector: 'AND' }]);
  };

  const removeCondition = (index) => {
    onChange(conditions.filter((_, i) => i !== index));
  };

  const updateCondition = (index, updates) => {
    const newConditions = [...conditions];
    newConditions[index] = { ...newConditions[index], ...updates };
    onChange(newConditions);
  };

  const buildExpression = () => {
    if (conditions.length === 0) return '';
    
    return conditions.map((cond, idx) => {
      const field = FIELDS.find(f => f.key === cond.field);
      let expr = '';
      
      if (cond.operator === 'contains') {
        expr = `${cond.field}.toLowerCase().includes("${cond.value.toLowerCase()}")`;
      } else if (field?.type === 'boolean') {
        expr = `${cond.field} = ${cond.value}`;
      } else {
        expr = `${cond.field} ${cond.operator} "${cond.value}"`;
      }
      
      if (idx > 0) {
        expr = ` ${conditions[idx - 1].connector} ${expr}`;
      }
      
      return expr;
    }).join('');
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-semibold">Συνθήκες Φίλτρων</Label>
        <Button size="sm" variant="outline" onClick={addCondition}>
          <Plus className="h-3 w-3 mr-1" />
          Προσθήκη Συνθήκης
        </Button>
      </div>

      {conditions.length === 0 ? (
        <Card className="p-8 text-center border-dashed">
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-3">Δεν υπάρχουν συνθήκες</p>
          <Button size="sm" variant="outline" onClick={addCondition}>
            <Plus className="h-3 w-3 mr-1" />
            Προσθήκη Πρώτης Συνθήκης
          </Button>
        </Card>
      ) : (
        <div className="space-y-3">
          {conditions.map((condition, index) => {
            const selectedField = FIELDS.find(f => f.key === condition.field);
            const operators = OPERATORS[selectedField?.type || 'text'];

            return (
              <div key={index}>
                {index > 0 && (
                  <div className="flex items-center gap-2 mb-2">
                    <div className="flex-1 h-px bg-slate-200" />
                    <select
                      value={conditions[index - 1].connector}
                      onChange={(e) => updateCondition(index - 1, { connector: e.target.value })}
                      className="px-3 py-1 text-xs font-semibold border rounded-md bg-white dark:bg-slate-800"
                    >
                      <option value="AND">ΚΑΙ (AND)</option>
                      <option value="OR">Ή (OR)</option>
                    </select>
                    <div className="flex-1 h-px bg-slate-200" />
                  </div>
                )}
                
                <Card className="p-3">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 grid grid-cols-3 gap-2">
                      <div>
                        <select
                          value={condition.field}
                          onChange={(e) => updateCondition(index, { field: e.target.value })}
                          className="w-full h-9 px-2 text-sm border rounded-md"
                        >
                          {FIELDS.map(field => (
                            <option key={field.key} value={field.key}>{field.label}</option>
                          ))}
                        </select>
                      </div>
                      
                      <div>
                        <select
                          value={condition.operator}
                          onChange={(e) => updateCondition(index, { operator: e.target.value })}
                          className="w-full h-9 px-2 text-sm border rounded-md"
                        >
                          {operators.map(op => (
                            <option key={op.value} value={op.value}>{op.label}</option>
                          ))}
                        </select>
                      </div>
                      
                      <div>
                        {selectedField?.type === 'boolean' ? (
                          <select
                            value={condition.value}
                            onChange={(e) => updateCondition(index, { value: e.target.value })}
                            className="w-full h-9 px-2 text-sm border rounded-md"
                          >
                            <option value="true">Ναι</option>
                            <option value="false">Όχι</option>
                          </select>
                        ) : (
                          <Input
                            value={condition.value}
                            onChange={(e) => updateCondition(index, { value: e.target.value })}
                            placeholder="Τιμή..."
                            className="h-9 text-sm"
                          />
                        )}
                      </div>
                    </div>
                    
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => removeCondition(index)}
                      className="text-red-500 hover:text-red-600 h-9 w-9"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </Card>
              </div>
            );
          })}
        </div>
      )}

      {conditions.length > 0 && (
        <>
          <div className="pt-2">
            <Label className="text-xs text-slate-500 dark:text-slate-400 mb-1 block">Έκφραση που δημιουργήθηκε:</Label>
            <Card className="p-3 bg-slate-50 dark:bg-slate-800">
              <code className="text-xs text-slate-700 dark:text-slate-300 break-all">
                {buildExpression() || '(κενή)'}
              </code>
            </Card>
          </div>

          <div className="flex items-center justify-between pt-2 border-t">
            <Button
              variant="outline"
              size="sm"
              onClick={onTest}
              disabled={isTestLoading}
            >
              <Play className="h-3 w-3 mr-1" />
              Δοκιμή Ερωτήματος
            </Button>
            {testCount !== null && (
              <span className={cn(
                "text-sm font-semibold px-3 py-1 rounded-full",
                testCount > 0 ? "bg-green-100 text-green-700" : "bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300"
              )}>
                {testCount} {testCount === 1 ? 'εγγραφή' : 'εγγραφές'}
              </span>
            )}
          </div>
        </>
      )}
    </div>
  );
}
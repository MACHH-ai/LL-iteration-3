import React, { useState, useEffect } from 'react';
import { View, Text, FlatList, StyleSheet, TextInput, Button } from 'react-native';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import LoadingSpinner from '@/components/LoadingSpinner';

// Define the type for a single todo item
type Todo = {
  id: number;
  title: string;
  is_complete: boolean;
};

export default function TodoScreen() {
  const { user } = useAuth();
  const [todos, setTodos] = useState<Todo[]>([]);
  const [newTodoTitle, setNewTodoTitle] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) {
      fetchTodos();
    }
  }, [user]);

  const fetchTodos = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('todos')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching todos:', error);
    } else {
      setTodos(data as Todo[]);
    }
    setLoading(false);
  };

  const addTodo = async () => {
    if (!newTodoTitle.trim() || !user) return;

    const { data, error } = await supabase
      .from('todos')
      .insert([{ title: newTodoTitle, user_id: user.id }])
      .select();

    if (error) {
      console.error('Error adding todo:', error);
    } else if (data) {
      // Add the new todo to the top of the list
      setTodos([data[0] as Todo, ...todos]);
      setNewTodoTitle('');
    }
  };

  if (loading) {
    return <LoadingSpinner />;
  }

  return (
    <View style={styles.container}>
      <Text style={styles.header}>My Todos</Text>
      <View style={styles.inputContainer}>
        <TextInput
          style={styles.input}
          placeholder="Add a new todo..."
          value={newTodoTitle}
          onChangeText={setNewTodoTitle}
        />
        <Button title="Add" onPress={addTodo} />
      </View>
      <FlatList
        data={todos}
        keyExtractor={(item) => item.id.toString()}
        renderItem={({ item }) => (
          <View style={styles.todoItem}>
            <Text style={item.is_complete ? styles.completed : {}}>{item.title}</Text>
          </View>
        )}
        ListEmptyComponent={<Text>No todos yet. Add one!</Text>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: '#fff',
  },
  header: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 20,
  },
  inputContainer: {
    flexDirection: 'row',
    marginBottom: 20,
  },
  input: {
    flex: 1,
    borderColor: '#ccc',
    borderWidth: 1,
    padding: 10,
    marginRight: 10,
    borderRadius: 5,
  },
  todoItem: {
    padding: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  completed: {
    textDecorationLine: 'line-through',
    color: '#aaa',
  },
});